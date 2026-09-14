/**
 * SF-RC4 (#1343) — interaction-state coverage, proven against the real
 * `--load-extension` build.
 *
 * The unit suite pins the wiring (which events schedule a pass, that a
 * burst collapses into one, that an unthemed page does nothing). It cannot
 * pin the thing this story is actually about: jsdom applies no stylesheet
 * rule to `getComputedStyle` at all, so a `:hover` colour swap does not
 * exist there. Only a real browser can show that the swap happens, that
 * nothing in this codebase's observation model sees it, and that the
 * settled-interaction pass repairs it anyway.
 *
 * The decision this story records is (a), bounded incremental — see the
 * issue for why, and `pipeline.ts`'s `INTERACTION_EVENTS` for the covered
 * set and the states explicitly *not* claimed.
 *
 * SF4 (#1360) classification: visual-claim, justified — the claim is about
 * colour resolution, which computed style reflects directly, with no
 * `filter` compositing involved.
 */

import { relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import type { Page } from "@playwright/test"

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
    throw new Error(`expected an opaque colour, got: ${css}`)
  }
  return [Number(r) / 255, Number(g) / 255, Number(b) / 255]
}

function contrastOf(fgCss: string, bgCss: string): number {
  const fg = relativeLuminance(...channels(fgCss))
  const bg = relativeLuminance(...channels(bgCss))
  const [lighter, darker] = fg > bg ? [fg, bg] : [bg, fg]
  return (lighter + 0.05) / (darker + 0.05)
}

type Reading = {
  readonly repairKey: string | null
  readonly verdict: string | null
  readonly color: string
  readonly backdrop: string
}

async function read(page: Page, id: string): Promise<Reading> {
  return page.evaluate((elementId: string) => {
    const el = document.getElementById(elementId)
    const panel = document.getElementById("panel")
    if (el === null || panel === null) throw new Error("fixture missing")
    return {
      repairKey: el.getAttribute("data-sw-legibility-fix"),
      verdict: el.getAttribute("data-sw-legibility"),
      color: getComputedStyle(el).color,
      backdrop: getComputedStyle(panel).backgroundColor,
    }
  }, id)
}

/** Past `INTERACTION_SETTLE_MS` plus the pass itself, with margin. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(500)
}

test.describe("SF-RC4: a :hover-only colour swap is repaired (#1343)", () => {
  test("the carrier is untagged at rest, and repaired once hover settles", async ({
    fixture,
  }) => {
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    // The precondition matters as much as the claim: at rest this carrier
    // inherits its panel's already-corrected colour, so it is legitimately
    // not a candidate. Without asserting that, a pass that tagged
    // everything unconditionally would look like success.
    const atRest = await read(page, "hover-carrier")
    expect(
      atRest.repairKey,
      "at rest the carrier inherits a corrected colour and needs no repair"
    ).toBeNull()
    expect(contrastOf(atRest.color, atRest.backdrop)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO
    )

    await page.hover("#hover-carrier")
    await settle(page)

    const hovered = await read(page, "hover-carrier")
    expect(
      hovered.repairKey,
      "the :hover colour swap is a computed-style change with no mutation — " +
        "the settled-interaction pass is the only thing that can see it"
    ).not.toBeNull()

    const ratio = contrastOf(hovered.color, hovered.backdrop)
    expect(
      ratio,
      `hovered carrier renders ${hovered.color} on ${hovered.backdrop} — ` +
        `${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })

  test("a :focus-only colour swap is repaired too", async ({ fixture }) => {
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    expect((await read(page, "focus-carrier")).repairKey).toBeNull()

    await page.focus("#focus-carrier")
    await settle(page)

    const focused = await read(page, "focus-carrier")
    expect(
      focused.repairKey,
      "focusin/focusout are the bubbling counterparts delegation requires — " +
        "focus/blur would never reach a listener on document"
    ).not.toBeNull()
    expect(contrastOf(focused.color, focused.backdrop)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO
    )
  })

  test("a carrier with no interaction rule is left alone throughout", async ({
    fixture,
  }) => {
    // The control. An absence assertion, so a pass that indiscriminately
    // tagged every carrier it walked would fail here rather than read as a
    // success everywhere else.
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    await page.hover("#hover-carrier")
    await settle(page)
    await page.focus("#focus-carrier")
    await settle(page)

    const control = await read(page, "static-carrier")
    expect(control.repairKey).toBeNull()
    expect(control.verdict).toBeNull()
    expect(contrastOf(control.color, control.backdrop)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO
    )
  })

  test("the repair is dropped again once the interaction ends", async ({
    fixture,
  }) => {
    // `pointerout` schedules a pass too, so leaving the element re-derives
    // the resting verdict from the resting evidence — the carrier must not
    // keep a repair calibrated for a colour it no longer has. This is the
    // same fixed-point discipline (#831, Theorem 7.2) the rest of the
    // channel runs on, exercised across a state boundary.
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    await page.hover("#hover-carrier")
    await settle(page)
    expect((await read(page, "hover-carrier")).repairKey).not.toBeNull()

    await page.hover("#static-carrier")
    await settle(page)

    const released = await read(page, "hover-carrier")
    expect(
      released.repairKey,
      "a repair must not outlive the state that justified it"
    ).toBeNull()
    expect(
      contrastOf(released.color, released.backdrop)
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})
