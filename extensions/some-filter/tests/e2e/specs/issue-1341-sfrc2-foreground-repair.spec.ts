/**
 * The independent foreground action alphabet, against the real
 * `--load-extension` build.
 *
 * `foreground-repair.test.ts` proves decide/realize in isolation; only real
 * Chromium shows the emitted rule *wins the cascade* against an inline
 * `style="color: …"` and the co-located `emit-surface-color` rule, and that
 * the rendered pair clears the floor (Gate-0 recon measured 1.025:1 and
 * 1.14:1 before).
 *
 * Measures the *resolved* pair rather than pixels: antialiasing is not what
 * a WCAG floor is defined over. (`issue-741-auto-defects.spec.ts` uses
 * pixels where the claim is about painted output.)
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
 * Reads one carrier's rendered foreground and the first opaque background at
 * or above it (`resolveEffectiveBackdrop`'s walk, without hazards or alpha).
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

    // κ_hi (canon Definition C.3): the repair stops at the first value in
    // modifyForegroundColor's band that clears — never raw white.
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

    // An absence assertion: this one is left strictly alone.
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

    // Past the 0.3s transition, so the round below starts from a *settled*
    // repaired colour; mid-transition the bug hides itself.
    await page.waitForTimeout(700)

    const sheetBefore = await page.evaluate(
      () => document.getElementById("__sw_legibility_repair")?.textContent
    )
    expect(sheetBefore).toBeTruthy()

    // A real vendor mutation drives a round. Without repair-sheet
    // suppression it would read back our own !important colour, drop the
    // rule, and flicker.
    await page.evaluate(() => {
      const el = document.createElement("p")
      el.textContent = "late content"
      document.body.appendChild(el)
    })
    await page.waitForTimeout(700)

    const chip = await readCarrier(page, "chip")
    expect(
      chip.repairKey,
      "the repair must survive a later reconcile round, not oscillate"
    ).not.toBeNull()
    expect(contrastOf(chip)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)

    // Suppressing the repair sheet *starts* a vendor colour transition, and
    // an immediate read returns its start value — our own repair (confirmed
    // in Chromium). Only a freeze around the read senses the settled value.
    const transitioned = await readCarrier(page, "transitioned")
    expect(
      transitioned.repairKey,
      "a carrier under a vendor colour transition must stay repaired too"
    ).not.toBeNull()
    expect(contrastOf(transitioned)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)

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
    // Leaving auto never runs a round that settles without `activate-theme`,
    // and restoreVendor() knows only the pre-adapter layers, so both the
    // repair sheet and the per-surface background half would leak (measured:
    // #card stayed rgb(23, 23, 23) with the extension off). Asserts the whole
    // transition cleanup.
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
    ).toEqual({ repairSheet: true, patched: 4, fixed: 3 })

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
      freezeSheet: document.getElementById("__sw_legibility_freeze") !== null,
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
      freezeSheet: false,
      patched: 0,
      fixed: 0,
      legibility: 0,
      // The fixture's authored values, untouched — a zero attribute count
      // alone would pass with an uncleaned stylesheet.
      cardBg: "rgb(245, 245, 245)",
      chipColor: "rgb(17, 17, 17)",
    })
  })
})
