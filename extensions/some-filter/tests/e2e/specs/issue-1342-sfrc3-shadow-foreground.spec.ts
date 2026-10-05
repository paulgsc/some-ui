/**
 * The rendered-contrast closure projected into shadow scopes, against the
 * real `--load-extension` build.
 *
 * The unit suites prove the bookkeeping (which sheets are adopted, which
 * actions survive, the compensated rule text). Only e2e can prove a rule
 * realized through a scope's `adoptedStyleSheets` *wins the cascade* there,
 * against an inline `style="color: …"` and the co-located surface rule:
 * jsdom applies neither `adoptedStyleSheets` nor `<style>` rules to
 * `getComputedStyle`.
 *
 * Measures the *resolved* pair (computed `color` against the nearest opaque
 * background, crossing shadow boundaries as `resolveEffectiveBackdrop`
 * does) rather than pixels: a WCAG floor is defined over colour resolution.
 *
 * Classification (#1360): visual claim, justified above — no `filter`
 * compositing is involved in the cases that assert a repair; the one case
 * under a vendor `invert(1)` asserts an absence, and says why.
 */

import { relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import {
  mountDocumentBackdropCrosser,
  mountNestedBackdropCrosser,
  mountNestedShadowWitnesses,
  mountShadowWitnesses,
  mountTransitioningBackdropScope,
  mountTransitioningDocumentRegion,
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
    // "Converge identically": the adapter half is scope-agnostic, so the
    // same authored pair lands on the same repaired colour in any scope.
    // Compared against the document-scope witnesses, not a literal, so a
    // retuned band stays covered.
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
        // Object identity, not equal text: avoiding a per-scope parse is
        // what the shared cache is for.
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
    // The foreground rules are counter-inverted at both scopes
    // (`buildForegroundRepairRule`'s `vendorInvert`), but that is not
    // reachable yet, correctly: `detectVendorInvert()` is non-zero only with
    // a `filter` on `<html>`, and `hasGroupCompositingHazard` resolves every
    // carrier under such a root `"underdetermined"`, which
    // `decideForegroundRepairs` skips — a guess is not a repair. While #1337
    // (the background path's missing compensation) is open, a live channel
    // would calibrate against a colour nobody sees. The diagnostic tag still
    // reports the carrier.
    //
    // A *recorded boundary*: when the hazard is narrowed for a root-level
    // `invert()`, this case will fail and say so.
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

test.describe("SF-RC3: a carrier whose backdrop resolves one scope out (#1342)", () => {
  test("a nested-root carrier with no background of its own is repaired against the outer scope's themed surface", async ({
    fixture,
  }) => {
    // The backdrop is the *outer* scope's surface, and the inner scope is
    // projected first, against its still-native white. Without an
    // ancestor-driven re-contrast the carrier keeps its authored black.
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountNestedBackdropCrosser(
      page,
      "sf-rc3-cross-outer",
      "sf-rc3-cross-inner"
    )
    await waitForShadowScopeCommitted(page, ["sf-rc3-cross-outer"])
    // The repair lands on the inner scope's later re-contrast; poll for it.
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

test.describe("SF-RC3: a repaired shadow carrier survives later rounds (#1342)", () => {
  test("a carrier under a vendor colour transition stays repaired across a reprojection", async ({
    fixture,
  }) => {
    // A scope's teardown drops the repair sheet and its re-commit audits
    // next. If the freeze stops matching before that drop resolves (it
    // selects the same attribute the repair keys on), the audit reads the
    // transition's start value — the repair itself — and omits it for good.
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

    // Past the 0.3s transition: mid-transition the sensed value still
    // violates and the bug hides itself.
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

test.describe("SF-RC3: a carrier whose backdrop resolves out to the document (#1342)", () => {
  test("a top-level shadow carrier is repaired once the document darkens the light-DOM ancestor behind it", async ({
    fixture,
  }) => {
    // The backdrop walk continues into the light DOM, onto an element the
    // document pipeline darkens after its debounce, while this scope was
    // projected synchronously against white. Only a document-driven
    // re-contrast reaches it.
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountDocumentBackdropCrosser(
      page,
      "sf-rc3-doc-ancestor",
      "sf-rc3-doc-host"
    )

    await page.waitForFunction(
      () =>
        document
          .getElementById("sf-rc3-doc-ancestor")
          ?.hasAttribute("data-sw-patched") === true,
      undefined,
      { timeout: 5_000, polling: 100 }
    )
    await page.waitForFunction(
      () =>
        document
          .getElementById("sf-rc3-doc-host")
          ?.shadowRoot?.querySelector(".sf-rc3-crosser")
          ?.hasAttribute("data-sw-legibility-fix") === true,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const crosser = await readShadowCarrier(
      page,
      ["sf-rc3-doc-host"],
      "sf-rc3-crosser"
    )
    const ratio = contrastOf(crosser)
    expect(
      ratio,
      `document-crossing carrier renders ${crosser.color} on ` +
        `${crosser.backdrop} — ${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})

test.describe("SF-RC3: the audit reads a settled backdrop, not one mid-transition (#1342)", () => {
  test("a shadow carrier over a surface with an authored background-color transition is still repaired", async ({
    fixture,
  }) => {
    // Darkening starts the surface's authored transition and the audit runs
    // in the same task, so without a freeze it reads native white; finishing
    // a transition schedules no round.
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountTransitioningBackdropScope(page, "sf-rc3-tx-bg-host")
    await waitForShadowScopeCommitted(page, ["sf-rc3-tx-bg-host"])

    // Well past the 2s transition: whatever verdict the audit reached, the
    // backdrop has settled by now, so this measures what a reader sees.
    await page.waitForTimeout(2500)

    const carrier = await readShadowCarrier(
      page,
      ["sf-rc3-tx-bg-host"],
      "sf-rc3-crosser"
    )
    expect(
      carrier.repairKey,
      "the carrier must be scored against the settled dark backdrop"
    ).not.toBeNull()
    const ratio = contrastOf(carrier)
    expect(
      ratio,
      `carrier renders ${carrier.color} on settled ${carrier.backdrop} — ` +
        `${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })

  test("the same holds in the light DOM, where fire() has audited right after realize() since SF-RC1", async ({
    fixture,
  }) => {
    // The document half of the same freeze rule, asserted rather than
    // implied.
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)
    await mountTransitioningDocumentRegion(
      page,
      "sf-rc3-tx-doc-region",
      "sf-rc3-tx-doc-carrier"
    )
    await page.waitForFunction(
      () =>
        document
          .getElementById("sf-rc3-tx-doc-region")
          ?.hasAttribute("data-sw-patched") === true,
      undefined,
      { timeout: 5_000, polling: 100 }
    )
    await page.waitForTimeout(2500)

    const reading = await page.evaluate(() => {
      const el = document.getElementById("sf-rc3-tx-doc-carrier")
      const region = document.getElementById("sf-rc3-tx-doc-region")
      if (el === null || region === null) throw new Error("fixture missing")
      return {
        repairKey: el.getAttribute("data-sw-legibility-fix"),
        verdict: el.getAttribute("data-sw-legibility"),
        color: getComputedStyle(el).color,
        backdrop: getComputedStyle(region).backgroundColor,
      }
    })

    expect(reading.repairKey).not.toBeNull()
    const ratio = contrastOf(reading)
    expect(
      ratio,
      `light-DOM carrier renders ${reading.color} on settled ` +
        `${reading.backdrop} — ${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})
