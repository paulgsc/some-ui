/**
 * Regression coverage for Gate 0's G0.7 finding (canon §9.2's coverage-gap
 * addendum): legacy mode's document-level `html { filter: invert(...) }`
 * already composites correctly across a flat open shadow root, a root nested
 * two levels deep, and slotted light-DOM content — as a raw CSS primitive
 * and in the real built extension. Per the canon: "legacy mode needs no new
 * custody machinery: it is the degenerate point in Definition D.5's own
 * state space where every non-root scope stays permanently unregistered,
 * entirely covered by r_0's pre-existing, document-wide Bootstrap hold."
 * A lock on a proven property, not a fix.
 *
 * `filter` compositing is invisible to `getComputedStyle`, so every
 * assertion is a pixel sample (`pixels.ts`).
 *
 * Out of scope: whether an ancestor `filter` reaches the *top layer* (#1191),
 * a separate mechanism; nothing here promotes a node to the top layer.
 *
 * Classification (#1360): already compliant (real pixel samples).
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import {
  backgroundWorker,
  enterLegacyMode,
  LEGACY_CONFIG,
} from "@filter/playwright/fixtures/legacy-mode"
import {
  brightestIn,
  contentWidth,
  DARK,
  describeColor,
} from "@filter/playwright/fixtures/pixels"
import type { Page } from "@playwright/test"

const FILTER_STRING = [
  `invert(${LEGACY_CONFIG.invert})`,
  `hue-rotate(${LEGACY_CONFIG.hueRotate}deg)`,
  `sepia(${LEGACY_CONFIG.sepia})`,
  `brightness(${LEGACY_CONFIG.brightness})`,
  `contrast(${LEGACY_CONFIG.contrast})`,
].join(" ")

/**
 * A `position: fixed; inset: 0` surface's containing block is the viewport
 * at any shadow depth, so a whole-page screenshot samples exactly the
 * surface under test.
 */
const FULL_VIEWPORT_SURFACE_STYLE =
  "position:fixed;inset:0;z-index:999999;margin:0;padding:0;" +
  "background-color:rgb(255,255,255);"

async function buildFlatShadowSurface(page: Page): Promise<void> {
  await page.evaluate((style: string) => {
    const host = document.createElement("div")
    const root = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.setAttribute("style", style)
    root.appendChild(surface)
    document.body.appendChild(host)
  }, FULL_VIEWPORT_SURFACE_STYLE)
}

async function buildNestedShadowSurface(page: Page): Promise<void> {
  await page.evaluate((style: string) => {
    const outerHost = document.createElement("div")
    const outerRoot = outerHost.attachShadow({ mode: "open" })
    const innerHost = document.createElement("div")
    outerRoot.appendChild(innerHost)
    const innerRoot = innerHost.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.setAttribute("style", style)
    innerRoot.appendChild(surface)
    document.body.appendChild(outerHost)
  }, FULL_VIEWPORT_SURFACE_STYLE)
}

async function buildSlottedShadowSurface(page: Page): Promise<void> {
  await page.evaluate((style: string) => {
    const host = document.createElement("div")
    const root = host.attachShadow({ mode: "open" })
    root.appendChild(document.createElement("slot"))
    // Light-DOM child of `host`, projected into the shadow tree's default
    // <slot> above — the surface itself lives outside the shadow root.
    const surface = document.createElement("div")
    surface.setAttribute("style", style)
    host.appendChild(surface)
    document.body.appendChild(host)
  }, FULL_VIEWPORT_SURFACE_STYLE)
}

async function expectViewportDark(page: Page, label: string): Promise<void> {
  const viewport = page.viewportSize()
  if (viewport === null) throw new Error("no viewport")
  const { color, luminance: lum } = await brightestIn(page, page.context(), {
    x: 0,
    y: 0,
    width: await contentWidth(page),
    height: viewport.height,
  })
  expect(
    lum,
    `${label}: brightest pixel was ${describeColor(color)} — legacy invert ` +
      "must reach a shadow-hosted surface the same as an ordinary light-DOM one"
  ).toBeLessThan(DARK)
}

test.describe("SF-LG — raw platform primitive: filter: invert() on <html> reaches shadow content, no extension involved", () => {
  test("a flat open shadow root", async ({ context }) => {
    const scene = await context.newPage()
    await scene.setViewportSize({ width: 400, height: 300 })
    try {
      await scene.setContent(
        `<!doctype html><html style="filter: ${FILTER_STRING}">` +
          `<body style="margin:0;background:#fff"></body></html>`
      )
      await buildFlatShadowSurface(scene)
      await expectViewportDark(scene, "flat shadow root")
    } finally {
      await scene.close()
    }
  })

  test("a shadow root nested two levels deep", async ({ context }) => {
    const scene = await context.newPage()
    await scene.setViewportSize({ width: 400, height: 300 })
    try {
      await scene.setContent(
        `<!doctype html><html style="filter: ${FILTER_STRING}">` +
          `<body style="margin:0;background:#fff"></body></html>`
      )
      await buildNestedShadowSurface(scene)
      await expectViewportDark(scene, "nested shadow root")
    } finally {
      await scene.close()
    }
  })

  test("slotted light-DOM content projected through a shadow root", async ({
    context,
  }) => {
    const scene = await context.newPage()
    await scene.setViewportSize({ width: 400, height: 300 })
    try {
      await scene.setContent(
        `<!doctype html><html style="filter: ${FILTER_STRING}">` +
          `<body style="margin:0;background:#fff"></body></html>`
      )
      await buildSlottedShadowSurface(scene)
      await expectViewportDark(scene, "slotted content")
    } finally {
      await scene.close()
    }
  })
})

test.describe("SF-LG — real extension: legacy mode reaches shadow content the same as light-DOM content", () => {
  test("a flat open shadow root", async ({ context, fixture }) => {
    const page = await fixture.goto("light-page")
    await waitForClassification(page)
    await buildFlatShadowSurface(page)

    const sw = await backgroundWorker(context)
    await enterLegacyMode(sw, "light-page.html", LEGACY_CONFIG)
    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-sw-legacy"),
      undefined,
      { timeout: 5_000, polling: 100 }
    )
    await page.waitForFunction(
      () => document.getElementById("__sw_prepaint_veil") === null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    await expectViewportDark(page, "flat shadow root")
  })

  test("a shadow root nested two levels deep", async ({ context, fixture }) => {
    const page = await fixture.goto("light-page")
    await waitForClassification(page)
    await buildNestedShadowSurface(page)

    const sw = await backgroundWorker(context)
    await enterLegacyMode(sw, "light-page.html", LEGACY_CONFIG)
    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-sw-legacy"),
      undefined,
      { timeout: 5_000, polling: 100 }
    )
    await page.waitForFunction(
      () => document.getElementById("__sw_prepaint_veil") === null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    await expectViewportDark(page, "nested shadow root")
  })

  test("slotted light-DOM content projected through a shadow root", async ({
    context,
    fixture,
  }) => {
    const page = await fixture.goto("light-page")
    await waitForClassification(page)
    await buildSlottedShadowSurface(page)

    const sw = await backgroundWorker(context)
    await enterLegacyMode(sw, "light-page.html", LEGACY_CONFIG)
    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-sw-legacy"),
      undefined,
      { timeout: 5_000, polling: 100 }
    )
    await page.waitForFunction(
      () => document.getElementById("__sw_prepaint_veil") === null,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    await expectViewportDark(page, "slotted content")
  })
})
