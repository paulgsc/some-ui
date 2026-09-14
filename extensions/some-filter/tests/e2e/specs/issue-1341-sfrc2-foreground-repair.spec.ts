/**
 * SF-RC2 (#1341) — the independent foreground action alphabet, proven
 * against the real `--load-extension` build rather than a jsdom DOM.
 *
 * The unit suite (`src/adapter/__tests__/foreground-repair.test.ts`) proves
 * the decide/realize halves in isolation; only a real Chromium can show
 * that the emitted rule actually *wins the cascade* against an inline
 * `style="color: …"` and against the co-located (#741) `emit-surface-color`
 * rule that can match the same carrier, and that what ends up rendered
 * clears the floor. Both of those are exactly what the epic's own Gate-0
 * recon measured at 1.025:1 and 1.14:1 before this story.
 *
 * Deliberately measures the *resolved* pair (the carrier's own computed
 * `color` against the nearest opaque ancestor background) rather than
 * sampling pixels: a screenshot oracle would also fold in font antialiasing
 * and subpixel coverage, which is not what a WCAG contrast floor is defined
 * over. `issue-741-auto-defects.spec.ts` uses a pixel oracle where the
 * claim genuinely is about painted output (a full-viewport veil); this
 * claim is about colour resolution.
 */

import { relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import { backgroundWorker } from "@filter/playwright/fixtures/legacy-mode"
import type { Page } from "@playwright/test"

const MIN_CONTRAST_RATIO = 4.5

type CarrierReading = {
  readonly repairKey: string | null
  readonly verdict: string | null
  readonly color: string
  readonly backdrop: string
}

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

function contrastOf(reading: CarrierReading): number {
  const fg = relativeLuminance(...channels(reading.color))
  const bg = relativeLuminance(...channels(reading.backdrop))
  const [lighter, darker] = fg > bg ? [fg, bg] : [bg, fg]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Reads one carrier's rendered foreground and the first opaque background
 * at or above it — the same "nearest opaque ancestor wins" walk
 * `resolveEffectiveBackdrop` performs, kept deliberately naive here (no
 * hazard handling, no alpha compositing) so the fixture, not the
 * measurement, is what has to stay simple.
 */
async function readCarrier(page: Page, id: string): Promise<CarrierReading> {
  return page.evaluate((elementId: string) => {
    const el = document.getElementById(elementId)
    if (el === null) throw new Error(`fixture element #${elementId} missing`)

    let backdrop = "rgb(255, 255, 255)"
    let cur: Element | null = el
    while (cur !== null) {
      const bg = getComputedStyle(cur).backgroundColor
      const opaque = bg.startsWith("rgb(")
      if (opaque) {
        backdrop = bg
        break
      }
      cur = cur.parentElement
    }

    return {
      repairKey: el.getAttribute("data-sw-legibility-fix"),
      verdict: el.getAttribute("data-sw-legibility"),
      color: getComputedStyle(el).color,
      backdrop,
    }
  }, id)
}

test.describe("SF-RC2: rendered foreground repair, document scope (#1341)", () => {
  test("escape route 2 — an explicit colour equal to its parent's is repaired to a legible one", async ({
    fixture,
  }) => {
    const page = await fixture.goto("legibility-repair-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const chip = await readCarrier(page, "chip")

    expect(
      chip.repairKey,
      "#chip declares the same colour its themed <nav> parent declares and " +
        "owns no background of its own, so no per-surface action can name " +
        "it — SF-RC2's alphabet is what has to"
    ).not.toBeNull()

    const ratio = contrastOf(chip)
    expect(
      ratio,
      `#chip renders ${chip.color} on ${chip.backdrop} — ${ratio.toFixed(3)}:1. ` +
        `Gate-0 measured this witness at 1.025:1 before the repair existed.`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)

    // κ_hi (canon Definition C.3): the repair lifts into
    // modifyForegroundColor's own band and stops at the first value that
    // clears — never raw white, which is as unacceptable a failure mode as
    // the unreadable one it replaces.
    expect(chip.color).not.toBe("rgb(255, 255, 255)")
  })

  test("escape route 1 — a carrier with its own colour and no own background is repaired", async ({
    fixture,
  }) => {
    const page = await fixture.goto("legibility-repair-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const label = await readCarrier(page, "label")

    expect(
      label.repairKey,
      "#label owns an explicit colour and no background at all, so " +
        "readAttr's background-gated ownTextColor branch can never see it"
    ).not.toBeNull()

    const ratio = contrastOf(label)
    expect(
      ratio,
      `#label renders ${label.color} on ${label.backdrop} — ${ratio.toFixed(3)}:1. ` +
        `Gate-0 measured this witness at 1.14:1 before the repair existed.`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
    expect(label.color).not.toBe("rgb(255, 255, 255)")
  })

  test("the negative control keeps inheriting its ancestor's co-located fix, untagged", async ({
    fixture,
  }) => {
    const page = await fixture.goto("legibility-repair-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const inherits = await readCarrier(page, "inherits")

    // An absence assertion, per #1341's own acceptance criteria — the point
    // is not that some other element got repaired instead, it is that this
    // one is left strictly alone.
    expect(
      inherits.repairKey,
      "#inherits declares no colour of its own; it already inherits #card's " +
        "corrected, hue-matched foreground and must receive no action"
    ).toBeNull()
    expect(inherits.verdict).toBeNull()

    const ratio = contrastOf(inherits)
    expect(
      ratio,
      `#inherits renders ${inherits.color} on ${inherits.backdrop} — ` +
        `${ratio.toFixed(3)}:1, inherited, with no action of its own`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })

  test("a repaired carrier stays repaired across later reconcile rounds", async ({
    fixture,
  }) => {
    const page = await fixture.goto("legibility-repair-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const sheetBefore = await page.evaluate(
      () => document.getElementById("__sw_legibility_repair")?.textContent
    )
    expect(sheetBefore).toBeTruthy()

    // A real vendor mutation, which is what drives a reconcile round.
    // Without the audit's own repair-sheet suppression the next round reads
    // back this channel's own !important colour, calls the carrier legible,
    // drops the rule, and the carrier reverts — a flicker driven by nothing
    // but the extension's own output.
    await page.evaluate(() => {
      const el = document.createElement("p")
      el.textContent = "late content"
      document.body.appendChild(el)
    })
    await page.waitForTimeout(500)

    const chip = await readCarrier(page, "chip")
    expect(
      chip.repairKey,
      "the repair must survive a later reconcile round, not oscillate"
    ).not.toBeNull()
    expect(contrastOf(chip)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)

    const sheetAfter = await page.evaluate(
      () => document.getElementById("__sw_legibility_repair")?.textContent
    )
    expect(
      sheetAfter,
      "an unchanged verdict must rewrite nothing at all (#831)"
    ).toBe(sheetBefore)
  })
})

test.describe("SF-RC2: leaving auto mode returns the page to native (#1341)", () => {
  test("no realized colour artifact survives an auto -> off transition", async ({
    context,
    fixture,
  }) => {
    // Codex review round 1, on this PR: the repair sheet's only teardown
    // was a reconcile round that settles without `activate-theme`, and
    // leaving auto mode never produces one — content.ts's applyState calls
    // contentSession.teardown() (which merely disconnects the observer)
    // before restoreVendor(), and restoreVendor() knows only about the two
    // pre-adapter layers.
    //
    // Measured directly while confirming that finding: the per-surface
    // background half leaks identically and far more visibly — #card
    // rendered `rgb(23, 23, 23)` with the extension switched *off*, i.e.
    // the page simply stayed dark. So this asserts the whole transition,
    // not just this story's own half: a "common mode-transition cleanup
    // path" that knowingly skipped its siblings would be a fiction.
    const page = await fixture.goto("legibility-repair-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const themed = await page.evaluate(() => ({
      repairSheet: document.getElementById("__sw_legibility_repair") !== null,
      patched: document.querySelectorAll("[data-sw-patched]").length,
      fixed: document.querySelectorAll("[data-sw-legibility-fix]").length,
    }))
    expect(
      themed,
      "precondition: auto mode actually realized all three artifact kinds"
    ).toEqual({ repairSheet: true, patched: 3, fixed: 2 })

    const sw = await backgroundWorker(context)
    const tabId = await sw.evaluate(async () => {
      // eslint-disable-next-line no-restricted-globals
      const tabs = await chrome.tabs.query({})
      const t = tabs.find((tab) =>
        tab.url?.includes("legibility-repair-page.html")
      )
      if (t?.id === undefined) throw new Error("no matching tab")
      return t.id
    })
    // tab-state.ts's STATE_CYCLE: auto -> off.
    await sw.evaluate(async (id) => {
      // eslint-disable-next-line no-restricted-globals
      await chrome.tabs.sendMessage(id, { type: "CYCLE_TAB_STATE" })
    }, tabId)
    await page.waitForTimeout(400)

    const off = await page.evaluate(() => ({
      darkAttr: document.documentElement.hasAttribute("data-sw-dark"),
      staticSheet: document.getElementById("__sw_dark_theme") !== null,
      dynamicSheet: document.getElementById("__sw_dark_dynamic") !== null,
      repairSheet: document.getElementById("__sw_legibility_repair") !== null,
      patched: document.querySelectorAll("[data-sw-patched]").length,
      fixed: document.querySelectorAll("[data-sw-legibility-fix]").length,
      legibility: document.querySelectorAll("[data-sw-legibility]").length,
      cardBg: getComputedStyle(document.getElementById("card") ?? document.body)
        .backgroundColor,
      chipColor: getComputedStyle(
        document.getElementById("chip") ?? document.body
      ).color,
    }))

    expect(off).toEqual({
      darkAttr: false,
      staticSheet: false,
      dynamicSheet: false,
      repairSheet: false,
      patched: 0,
      fixed: 0,
      legibility: 0,
      // The fixture's own authored values, back untouched — the real claim
      // here, since an attribute count of zero would still be satisfied by
      // a stylesheet nobody cleaned up.
      cardBg: "rgb(245, 245, 245)",
      chipColor: "rgb(17, 17, 17)",
    })
  })
})
