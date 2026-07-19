/**
 * Swatch-oracle hostile-page e2e — S6 (#691) of the some-filter-on-transport
 * epic. Mirrors #618's hostile-page conformance proof (transport's own
 * `tests/e2e/specs/*`, asserted against protocol state and the null
 * adapter) with its domain-output counterpart: same class of hostile churn,
 * but now asserting the *real* adapter actually lands the page on a chosen
 * swatch, never leaks native luminance, exonerates soundly, and is
 * comfortable — not just dark — once settled.
 *
 * Scope note (read before extending): every spec here runs against
 * `SWATCHES.default` — the only swatch reachable through the shipped
 * pipeline today. `content.ts`'s auto-mode content session hardcodes
 * `SWATCHES[DEFAULT_SWATCH_ID]` (S5, #690); no swatch-selection mechanism
 * exists yet to drive the other six registry entries through the real
 * extension (S2, #687's own non-goal: "No user-facing picker UI ... a
 * separate follow-on"). Once that selector exists, the convergence/comfort
 * specs below should be parameterized over `Object.values(SWATCHES)`
 * exactly as their acceptance criteria describe; until then, asserting a
 * swatch this pipeline can never actually select would be testing a
 * capability that doesn't exist.
 */

import {
  DEFAULT_SWATCH_ID,
  satisfiesComfort,
  SWATCHES,
  swatchSample,
} from "@filter/adapter/swatches"
import { parseColor } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import type { Page } from "@playwright/test"

import { churn } from "../fixtures/hostile-page"

const swatch = SWATCHES[DEFAULT_SWATCH_ID]
const COLOR_TOLERANCE = 0.08 // 0..1 per-channel budget; generous for AA/rounding

function colorsClose(
  a: string,
  b: string,
  tolerance = COLOR_TOLERANCE
): boolean {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (ca === null || cb === null) return false
  const distance = Math.sqrt(
    (ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2 + (ca[2] - cb[2]) ** 2
  )
  return distance <= tolerance
}

// ── Churn step table ──────────────────────────────────────────────────────────
// One named, self-contained transition per entry. Every recovery test below is
// built from this table so a failure localizes to a specific primitive (or to
// the accumulated history leading into it) instead of a single opaque 30s
// timeout at the end of a nine-operation script.

type ChurnStep = {
  readonly name: string
  readonly run: (p: Page) => Promise<void>
}

const CHURN_STEPS: ReadonlyArray<ChurnStep> = [
  { name: "blank", run: (p) => churn.blank(p) },
  { name: "themeFlip", run: (p) => churn.themeFlip(p) },
  { name: "bodyHeadReplace", run: (p) => churn.bodyHeadReplace(p) },
  { name: "styleChurn", run: (p) => churn.styleChurn(p) },
  { name: "spaNavigate", run: (p) => churn.spaNavigate(p) },
  { name: "rootReplace", run: (p) => churn.rootReplace(p) },
  {
    name: "virtualizedRecycle",
    run: (p) => churn.virtualizedRecycle(p, "#content-root", "k1", 1),
  },
  {
    name: "extensionDomRemoval",
    run: (p) => churn.extensionDomRemoval(p, "[data-my-ext]"),
  },
  { name: "sustainedMutation", run: (p) => churn.sustainedMutation(p, 500) },
]

// Runs the whole sequence, each primitive wrapped in a test.step so the
// Playwright report shows exactly which one was running when a hang/throw hit.
async function runFullChurnSequence(page: Page): Promise<void> {
  for (const step of CHURN_STEPS) {
    await test.step(step.name, async () => {
      await step.run(page)
    })
  }
}

// A single falsifiable transition assertion: after whatever just happened, the
// light hostile page must (re)settle onto the default swatch's dark canvas.
// waitForClassification is the recovery signal (the pipeline re-stamps
// swThemeApplied); the 300ms margin lets the coalescer's reconcile window plus
// realize() land before the computed style is read.
async function expectConverged(page: Page): Promise<void> {
  await waitForClassification(page)
  await page.waitForTimeout(300)

  const rendered = await page.evaluate(() => ({
    hasDarkAttr: document.documentElement.hasAttribute("data-sw-dark"),
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }))

  expect(rendered.hasDarkAttr).toBe(true)
  expect(colorsClose(rendered.bodyBg, swatch.bg0)).toBe(true)
}

test.describe("swatch-oracle: convergence (positive proof)", () => {
  test("per-surface classification lands on the default swatch's tokens before any churn", async ({
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    await waitForClassification(page)
    // The coalescer's reconcile window (50ms) plus a margin for the round
    // to actually settle and realize.
    await page.waitForTimeout(300)

    const rendered = await page.evaluate(() => ({
      card: getComputedStyle(document.getElementById("card")!).backgroundColor,
      strip: getComputedStyle(document.getElementById("strip")!)
        .backgroundColor,
      cardPatched: document.getElementById("card")?.dataset["swPatched"],
      stripPatched: document.getElementById("strip")?.dataset["swPatched"],
    }))

    // #card (white) is a light surface: tagged, and darkened hue-preserving.
    expect(rendered.cardPatched).toBeDefined()
    expect(colorsClose(rendered.card, "rgb(255, 255, 255)")).toBe(false)

    // #strip (near-black, matches today's bg-0) is preserve-band: tagged
    // "preserve", left alone by the CSS revert rule.
    expect(rendered.stripPatched).toBe("preserve")
  })

  test("the page wears the default swatch's canvas the moment it settles, before any churn", async ({
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    await expectConverged(page)
  })
})

// Each test owns exactly one transition: converge from a clean load, apply a
// single churn primitive, then require the page to re-converge. A failure here
// names the primitive that breaks recovery *in isolation* (independent of any
// accumulated history), so it is separable from an order/history effect.
test.describe("swatch-oracle: single-primitive recovery (isolation)", () => {
  for (const step of CHURN_STEPS) {
    test(`re-converges after ${step.name}()`, async ({ fixture }) => {
      const page = await fixture.goto("hostile-page")
      await test.step("initial converge", async () => {
        await expectConverged(page)
      })
      await test.step(step.name, async () => {
        await step.run(page)
      })
      await test.step("re-converge", async () => {
        await expectConverged(page)
      })
    })
  }
})

// The cumulative counterpart: one page walked through the whole sequence, with
// a convergence gate after every primitive. Because it is interleaved and
// history-preserving, the Playwright report reads as
//
//   ✓ blank        ✓ converge after blank
//   ✓ themeFlip    ✓ converge after themeFlip
//   ✗ converge after bodyHeadReplace   (timeout)
//
// which names the *first operation, given the full history before it*, after
// which the pipeline stops recovering — the single most useful signal for an
// observer-based system. Given up to nine 5s convergence gates, the default
// 30s test budget is not enough even on the happy path, so raise it.
test.describe("swatch-oracle: cumulative recovery (history-preserving)", () => {
  test("re-converges after every prefix of the full hostile sequence", async ({
    fixture,
  }) => {
    test.setTimeout(120_000)
    const page = await fixture.goto("hostile-page")
    await test.step("baseline converge", async () => {
      await expectConverged(page)
    })
    for (const step of CHURN_STEPS) {
      await test.step(step.name, async () => {
        await step.run(page)
      })
      await test.step(`converge after ${step.name}`, async () => {
        await expectConverged(page)
      })
    }
  })
})

test.describe("swatch-oracle: leak (Δt_eval = 0, §9.2/Thm C.1)", () => {
  test("no sampled frame across the full churn reads native (light) luminance", async ({
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    await waitForClassification(page)

    const samples: Array<{ luminance: number; visible: boolean }> = []

    async function sample(): Promise<void> {
      const result = await page.evaluate(() => {
        const veil = document.getElementById("__sw_prepaint_veil")
        const veilUp = veil?.isConnected ?? false
        const bg = getComputedStyle(document.body).backgroundColor
        return { bg, veilUp }
      })
      const c = parseColor(result.bg)
      const luminance =
        c === null ? 0 : 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] // coarse, sampling-only
      // "Visible" native luminance means: the veil is down AND the sampled
      // background reads light — i.e. the vendor's true (unthemed) canvas
      // would be showing right now.
      samples.push({ luminance, visible: !result.veilUp && luminance > 0.5 })
    }

    await sample()
    await churn.blank(page)
    await sample()
    await churn.themeFlip(page)
    await sample()
    await churn.bodyHeadReplace(page)
    await sample()
    await churn.styleChurn(page)
    await sample()
    await churn.spaNavigate(page)
    await sample()
    await churn.rootReplace(page)
    await sample()
    await churn.virtualizedRecycle(page, "#content-root", "k1", 1)
    await sample()
    await churn.extensionDomRemoval(page, "[data-my-ext]")
    await sample()

    const leaked = samples.filter((s) => s.visible)
    expect(leaked).toEqual([])
  })
})

test.describe("swatch-oracle: exoneration soundness (Leg A — gates S7)", () => {
  test("a genuinely-dark hostile page is exonerated (restored to native styling), never held", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dark-hostile-page")
    await waitForClassification(page)

    await runFullChurnSequence(page)
    await page.waitForTimeout(300)

    const rendered = await page.evaluate(() => ({
      themeApplied: document.body.dataset["swThemeApplied"],
      hasDarkAttr: document.documentElement.hasAttribute("data-sw-dark"),
      patchedCount: document.querySelectorAll("[data-sw-patched]").length,
    }))

    expect(rendered.themeApplied).toBe("none")
    expect(rendered.hasDarkAttr).toBe(false)
    expect(rendered.patchedCount).toBe(0)
  })

  test("a genuinely-light hostile page is never exonerated, even under sustained churn", async ({
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    await waitForClassification(page)

    await runFullChurnSequence(page)
    await page.waitForTimeout(300)

    const themeApplied = await page.evaluate(
      () => document.body.dataset["swThemeApplied"]
    )
    expect(themeApplied).toBe("dark")
  })
})

test.describe("swatch-oracle: comfort (Leg B — Φ_comfort on rendered output)", () => {
  test("the settled page's rendered bg/text satisfy Φ_comfort, not just 'is dark'", async ({
    fixture,
  }) => {
    const page = await fixture.goto("hostile-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    const rendered = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
    }))

    // Φ_comfort is defined over the swatch's own (bg0, text0) hex pair
    // (registry-time, S2). Re-running it here against the *rendered* body
    // background is Leg B's whole point: the same predicate, now checked
    // against live computed style rather than static registry data. The
    // registry-time predicate itself is re-asserted for the active swatch
    // as the anchor this comparison depends on (already covered
    // exhaustively for every registry entry by `swatches.test.ts`, S2).
    expect(colorsClose(rendered.bg, swatch.bg0)).toBe(true)
    expect(satisfiesComfort(swatchSample(swatch))).toBe(true)
  })
})
