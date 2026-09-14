/**
 * SF-RC3 (#1342) — the rendered-contrast closure projected into shadow
 * scopes, proven against the real `--load-extension` build.
 *
 * The unit suites (`shadow-actuator.test.ts`, `shadow-scope-theming.test.ts`,
 * `foreground-repair.test.ts`) prove the bookkeeping — which sheets are
 * adopted, which actions survive tagging, what the compensated rule text is.
 * None of them can prove the thing this story is actually about: that a rule
 * realized through a shadow scope's own `adoptedStyleSheets` *wins the
 * cascade* inside that scope, against an inline `style="color: …"` and
 * against the co-located (#741) rule that matches the same carrier's
 * surface. jsdom applies neither `adoptedStyleSheets` nor `<style>` rules to
 * `getComputedStyle` at all, so that half is an e2e claim by construction.
 *
 * Measures the *resolved* pair (computed `color` against the nearest opaque
 * background, crossing the shadow boundary through `host` the way
 * `resolveEffectiveBackdrop` itself does) rather than sampling pixels — the
 * same reasoning `issue-1341-sfrc2-foreground-repair.spec.ts`'s own header
 * sets out: a WCAG contrast floor is defined over colour resolution, not
 * over antialiased painted output.
 *
 * SF4 (#1360) classification: visual-claim, justified above — the claim is
 * about colour resolution inside a shadow tree, which computed style
 * reflects directly (no `filter` compositing is involved in the four cases
 * that assert a repair; the one case that *is* under a vendor `invert(1)`
 * asserts an absence, and says why).
 */

import { relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import {
  mountNestedBackdropCrosser,
  mountNestedShadowWitnesses,
  mountShadowWitnesses,
  mutateInsideShadowScope,
  readShadowCarrier,
  waitForShadowScopeCommitted,
  type ShadowCarrierReading,
} from "@filter/playwright/fixtures/shadow-legibility"

const MIN_CONTRAST_RATIO = 4.5

function channels(css: string): [number, number, number] {
  const match = css.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
  )
  if (match === null) throw new Error(`unparseable colour: ${css}`)
  const [, r, g, b, alpha] = match
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`unparseable colour: ${css}`)
  }
  if (alpha !== undefined && Number(alpha) < 1) {
    throw new Error(
      `expected an opaque colour for a contrast measurement, got: ${css}`
    )
  }
  return [Number(r) / 255, Number(g) / 255, Number(b) / 255]
}

function contrastOf(reading: ShadowCarrierReading): number {
  const fg = relativeLuminance(...channels(reading.color))
  const bg = relativeLuminance(...channels(reading.backdrop))
  const [lighter, darker] = fg > bg ? [fg, bg] : [bg, fg]
  return (lighter + 0.05) / (darker + 0.05)
}

test.describe("SF-RC3: both Gate-0 witnesses converge inside an open shadow root (#1342)", () => {
  test("escape route 2 — an explicit colour equal to its themed parent's is repaired inside the scope", async ({
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountShadowWitnesses(page, "sf-rc3-host")
    await waitForShadowScopeCommitted(page, ["sf-rc3-host"])

    const chip = await readShadowCarrier(page, ["sf-rc3-host"], "sf-rc3-chip")

    expect(
      chip.repairKey,
      "the shadow-hosted chip repeats its surface parent's colour and owns " +
        "no background, so no per-surface action can name it — the repair " +
        "alphabet has to, through this scope's own adoptedStyleSheets"
    ).not.toBeNull()

    const ratio = contrastOf(chip)
    expect(
      ratio,
      `shadow chip renders ${chip.color} on ${chip.backdrop} — ` +
        `${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
    // κ_hi (canon Definition C.3) — never raw white.
    expect(chip.color).not.toBe("rgb(255, 255, 255)")
  })

  test("escape route 1 — a carrier with its own colour and no own background is repaired inside the scope", async ({
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountShadowWitnesses(page, "sf-rc3-host")
    await waitForShadowScopeCommitted(page, ["sf-rc3-host"])

    const label = await readShadowCarrier(page, ["sf-rc3-host"], "sf-rc3-label")

    expect(label.repairKey).not.toBeNull()
    const ratio = contrastOf(label)
    expect(
      ratio,
      `shadow label renders ${label.color} on ${label.backdrop} — ` +
        `${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
    expect(label.color).not.toBe("rgb(255, 255, 255)")
  })

  test("both witnesses converge on the same colours a light-DOM carrier would (identical convergence, not merely legible)", async ({
    fixture,
  }) => {
    // #1342's own wording is "converge identically", not "converge" — the
    // whole design goal (#1338's "one scope-generic mechanism") is that the
    // adapter half is scope-agnostic and only the caller changes, so the
    // same authored pair must land on the same repaired colour whichever
    // scope it is in. Asserted against the document-scope fixture's own
    // witnesses rather than a hardcoded literal, so this stays true if
    // `modifyForegroundColor`'s band is ever retuned.
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountShadowWitnesses(page, "sf-rc3-host")
    await waitForShadowScopeCommitted(page, ["sf-rc3-host"])

    const chip = await readShadowCarrier(page, ["sf-rc3-host"], "sf-rc3-chip")
    const label = await readShadowCarrier(page, ["sf-rc3-host"], "sf-rc3-label")

    const documentPage = await fixture.goto("legibility-repair-page")
    await waitForClassification(documentPage)
    await documentPage.waitForTimeout(300)
    const reference = await documentPage.evaluate(() => ({
      chip: getComputedStyle(document.getElementById("chip") ?? document.body)
        .color,
      label: getComputedStyle(document.getElementById("label") ?? document.body)
        .color,
    }))

    expect(chip.color).toBe(reference.chip)
    expect(label.color).toBe(reference.label)
  })
})

test.describe("SF-RC3: nested shadow roots, two levels deep (#1342)", () => {
  test("a carrier inside a root inside a root is repaired by its own scope", async ({
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountNestedShadowWitnesses(page, "sf-rc3-outer", "sf-rc3-inner")
    await waitForShadowScopeCommitted(page, ["sf-rc3-outer", "sf-rc3-inner"])

    const label = await readShadowCarrier(
      page,
      ["sf-rc3-outer", "sf-rc3-inner"],
      "sf-rc3-label"
    )

    expect(label.repairKey).not.toBeNull()
    const ratio = contrastOf(label)
    expect(
      ratio,
      `nested shadow label renders ${label.color} on ${label.backdrop} — ` +
        `${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})

test.describe("SF-RC3: one CSSStyleSheet object serves every scope sharing a key (#1342)", () => {
  test("two scopes whose carriers resolve to the identical pair adopt the same sheet, not a duplicate parse", async ({
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountShadowWitnesses(page, "sf-rc3-host-a")
    await mountShadowWitnesses(page, "sf-rc3-host-b")
    await waitForShadowScopeCommitted(page, ["sf-rc3-host-a"])
    await waitForShadowScopeCommitted(page, ["sf-rc3-host-b"])

    const shared = await page.evaluate(() => {
      const repairSheets = (id: string): Array<CSSStyleSheet> => {
        const root = document.getElementById(id)?.shadowRoot
        if (root === null || root === undefined) {
          throw new Error(`#${id} has no open root`)
        }
        return [...root.adoptedStyleSheets].filter((sheet) =>
          [...sheet.cssRules].some((rule) =>
            rule.cssText.includes("data-sw-legibility-fix")
          )
        )
      }
      const a = repairSheets("sf-rc3-host-a")
      const b = repairSheets("sf-rc3-host-b")
      return {
        countA: a.length,
        countB: b.length,
        // Object identity, not equal rule text: a per-scope parse would be
        // visually indistinguishable and is exactly what the shared cache
        // exists to avoid.
        allShared: a.every((sheet) => b.includes(sheet)),
      }
    })

    expect(shared.countA, "scope A adopted no repair sheet").toBeGreaterThan(0)
    expect(shared.countB).toBe(shared.countA)
    expect(
      shared.allShared,
      "each repair sheet must be the same CSSStyleSheet object in both scopes"
    ).toBe(true)
  })
})

test.describe("SF-RC3: an active vendor filter: invert(1) (#1342)", () => {
  test("the channel declines rather than repairing against a backdrop it cannot resolve, at both scopes", async ({
    fixture,
  }) => {
    // #1342 asks that the new foreground rules be counter-inverted the way
    // the background path's already are, and they are
    // (`buildForegroundRepairRule`'s own `vendorInvert` parameter, threaded
    // at both scopes). What this case records is that the compensation is
    // not reachable *yet*, and why that is the correct state rather than a
    // gap:
    //
    // `detectVendorInvert()` is non-zero only when `document.documentElement`
    // carries a `filter`, and SF-RC1's own `hasGroupCompositingHazard` —
    // checked for every ancestor up to `documentElement`, regardless of
    // where colour accumulation resolves, because a group effect cannot be
    // occluded by an inner opaque layer — resolves every carrier under such
    // a root as `"underdetermined"`. `decideForegroundRepairs` skips those
    // outright: a guess is not a repair.
    //
    // Declining is right while #1337 (the document-level background path's
    // own missing compensation) is open. A live channel would score a
    // carrier against a declared backdrop whose own realization is
    // uncompensated — i.e. against a colour nobody ever sees — and emit a
    // repair calibrated for it. The diagnostic tag still reports the
    // carrier, so the gap is visible rather than silent.
    //
    // Asserted as a *recorded boundary*, not a desired end state: when that
    // hazard is narrowed for a recognized root-level `invert()`, this case
    // is what will fail and say so.
    const page = await fixture.goto("shadow-surface-vendor-invert-page")
    await waitForClassification(page)
    await mountShadowWitnesses(page, "sf-rc3-invert-host")
    await waitForShadowScopeCommitted(page, ["sf-rc3-invert-host"])

    const chip = await readShadowCarrier(
      page,
      ["sf-rc3-invert-host"],
      "sf-rc3-chip"
    )
    expect(chip.repairKey).toBeNull()
    expect(
      chip.verdict,
      "the diagnostic channel must still report the carrier — the violation " +
        "stays visible, it is only the repair that is withheld"
    ).toBe("underdetermined")

    const documentScope = await page.evaluate(() => ({
      repairSheet: document.getElementById("__sw_legibility_repair") !== null,
      fixed: document.querySelectorAll("[data-sw-legibility-fix]").length,
    }))
    expect(documentScope).toEqual({ repairSheet: false, fixed: 0 })
  })
})

test.describe("SF-RC3: a carrier whose backdrop resolves one scope out (#1342, bot-found)", () => {
  test("a nested-root carrier with no background of its own is repaired against the outer scope's themed surface", async ({
    fixture,
  }) => {
    // `resolveEffectiveBackdrop` climbs through `ShadowRoot.host`, so this
    // carrier's backdrop is the *outer* scope's surface — and discovery
    // registers (and projects) the inner scope first, so its own audit runs
    // against that surface's still-native white. Nothing the outer scope's
    // later darkening does is a mutation inside this root, nor a
    // `class`/`style` change on its host, so nothing re-audits it: without
    // an ancestor-driven re-contrast the carrier keeps its authored black on
    // a newly dark surface, permanently.
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountNestedBackdropCrosser(
      page,
      "sf-rc3-cross-outer",
      "sf-rc3-cross-inner"
    )
    await waitForShadowScopeCommitted(page, ["sf-rc3-cross-outer"])
    // The repair lands on the *inner* scope's own later re-contrast, which
    // the outer commit above triggers — poll for it rather than assuming it
    // is already there when the outer surface's tag appears.
    await page.waitForFunction(
      () => {
        const outer = document.getElementById("sf-rc3-cross-outer")
        const inner = outer?.shadowRoot?.getElementById("sf-rc3-cross-inner")
        return (
          inner?.shadowRoot
            ?.querySelector(".sf-rc3-crosser")
            ?.hasAttribute("data-sw-legibility-fix") === true
        )
      },
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const crosser = await readShadowCarrier(
      page,
      ["sf-rc3-cross-outer", "sf-rc3-cross-inner"],
      "sf-rc3-crosser"
    )
    const ratio = contrastOf(crosser)
    expect(
      ratio,
      `cross-scope carrier renders ${crosser.color} on ${crosser.backdrop} — ` +
        `${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})

test.describe("SF-RC3: a repaired shadow carrier survives later rounds (#1342, bot-found)", () => {
  test("a carrier under a vendor colour transition stays repaired across a reprojection", async ({
    fixture,
  }) => {
    // A scope's teardown (`clearShadowSurfaceState`, on every invalidate)
    // drops the repair sheet, and the very next thing its re-commit does is
    // audit. If the freeze stops matching before that drop resolves — which
    // is what clearing `data-sw-legibility-fix` first does, since the freeze
    // rule selects the same attribute the repair rule keys on — the audit
    // reads the transition's start value, the repair itself, calls the
    // carrier legible, and omits the repair for good.
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountShadowWitnesses(page, "sf-rc3-tx-host")
    await waitForShadowScopeCommitted(page, ["sf-rc3-tx-host"])

    const first = await readShadowCarrier(
      page,
      ["sf-rc3-tx-host"],
      "sf-rc3-transitioned"
    )
    expect(
      first.repairKey,
      "precondition: the transitioned carrier is repaired on the first commit"
    ).not.toBeNull()

    // Past the 0.3s transition, so the round driven below starts from a
    // *settled* repaired colour — mid-transition the sensed value is still
    // violating and the bug hides itself.
    await page.waitForTimeout(700)
    await mutateInsideShadowScope(page, "sf-rc3-tx-host")
    await page.waitForTimeout(700)

    const after = await readShadowCarrier(
      page,
      ["sf-rc3-tx-host"],
      "sf-rc3-transitioned"
    )
    expect(
      after.repairKey,
      "the repair must survive a reprojection round, not oscillate"
    ).toBe(first.repairKey)
    const ratio = contrastOf(after)
    expect(
      ratio,
      `transitioned carrier renders ${after.color} on ${after.backdrop} — ` +
        `${ratio.toFixed(3)}:1 after a reprojection`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})
