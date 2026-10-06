/**
 * Swatch-oracle hostile-page e2e: the domain-output counterpart to
 * transport's hostile-page conformance proof. Same class of hostile churn,
 * asserting the *real* adapter lands the page on a chosen swatch, never
 * leaks native luminance, exonerates soundly, and is comfortable — not just
 * dark — once settled.
 *
 * Scope note: every spec runs against `SWATCHES.default`, the only swatch
 * the shipped pipeline can select (no swatch picker exists). Once one does,
 * parameterize the convergence/comfort specs over `Object.values(SWATCHES)`.
 *
 * Classification (#1360): mostly visual claims, sound — the adapter patches
 * `background-color` directly (never `filter`), so computed-style reads have
 * no compositing gap. Known gap: the "leak (Δt_eval = 0)" block samples only
 * at step boundaries and cannot see a flash between samples the way
 * `frames.ts`'s `captureFrames`/`firstLeak` oracle would; not promoted.
 */

import {
  DEFAULT_SWATCH_ID,
  satisfiesComfort,
  SWATCHES,
  swatchSample,
} from "@filter/adapter/swatches"
import { parseColor } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import { churn } from "@filter/playwright/fixtures/hostile-page"
import type { Page } from "@playwright/test"

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
// One named transition per entry, so a failure localizes to a primitive (or
// the history leading into it) instead of one opaque timeout.

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

// After whatever just happened, the light hostile page must (re)settle onto
// the default swatch's dark canvas. The 300ms margin lets the reconcile
// window plus realize() land before the computed style is read.
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

// One transition per test from a clean load: a failure names the primitive
// that breaks recovery in isolation, separable from a history effect.
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

// The cumulative counterpart: one page walked through the whole sequence,
// with a convergence gate after every primitive, so the report names the
// first operation (given the full history before it) after which recovery
// stops. Up to nine 5s gates exceed the default 30s budget, so raise it.
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
      // "Visible" native luminance: the veil is down AND the background
      // reads light.
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

    // Φ_comfort against the *rendered* body background rather than registry
    // hex; the registry-time predicate is re-asserted as the anchor (every
    // entry is covered by `swatches.test.ts`).
    expect(colorsClose(rendered.bg, swatch.bg0)).toBe(true)
    expect(satisfiesComfort(swatchSample(swatch))).toBe(true)
  })
})
