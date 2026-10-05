/**
 * The regression test for #1262's repro: a hardcoded-white surface inside
 * `attachShadow({ mode: "open" })` must get *themed* (dark), not merely not
 * leak (`issue-1267-sfdc-shadow-custody.spec.ts` proves the zero-leak half).
 *
 * Reuses the three creation-trace drivers (`shadow-traces.ts`) for the
 * positive claim, plus a nested root at least two levels deep.
 *
 * `getComputedStyle().backgroundColor` suffices: `emit-surface-color` is an
 * ordinary `background-color` rule via `adoptedStyleSheets`, not a `filter`,
 * so there is no compositing gap.
 *
 * Classification (#1360): visual claim, sound — justified above.
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import {
  expect,
  test,
  waitForClassification,
} from "@filter/playwright/fixtures/gate0-fixture"
import {
  traceAttachOnConnectedHost,
  traceDisconnectedThenInsert,
  traceMutateExistingSurface,
  traceMutationSetup,
} from "@filter/playwright/fixtures/shadow-traces"
import type { Page } from "@playwright/test"

/**
 * Below `theme-adapter.ts`'s `LIGHT_THRESHOLD` (0.3): the white surface
 * starts at 1.0, so crossing this means it moved dark, without replicating
 * the exact hue-preserving target.
 */
const THEMED_LUMINANCE_CEILING = 0.3

/** Waits for `shadow-scope-theming.ts`'s own commit to land on the trace surface — its `data-sw-patched` tag is the observable signal, set only once `resolveCommitted`'s two-phase handoff has fully installed the realization. */
async function waitForSurfaceThemed(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const host = document.getElementById("shadow-trace-host")
      const surface = host?.shadowRoot?.getElementById("shadow-trace-surface")
      return surface?.dataset["swPatched"] !== undefined
    },
    undefined,
    { timeout: 5_000, polling: 100 }
  )
}

async function surfaceLuminance(page: Page): Promise<number> {
  const bg = await page.evaluate(() => {
    const host = document.getElementById("shadow-trace-host")
    const surface = host?.shadowRoot?.getElementById("shadow-trace-surface")
    return surface === null || surface === undefined
      ? null
      : getComputedStyle(surface).backgroundColor
  })
  expect(bg, "shadow-trace-surface not found").not.toBeNull()
  if (bg === null) throw new Error("unreachable")
  const rgba = parseColor(bg)
  expect(rgba, `unparseable computed background-color: ${bg}`).not.toBeNull()
  if (rgba === null) throw new Error("unreachable")
  return relativeLuminance(rgba[0], rgba[1], rgba[2])
}

test.describe("SF-AD — trace 1: shadow root populated before its disconnected host is inserted", () => {
  test("the shadow-internal surface actually themes dark, not merely non-native", async ({
    gate0,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)

    await traceDisconnectedThenInsert(page)
    await waitForSurfaceThemed(page)

    expect(await surfaceLuminance(page)).toBeLessThan(THEMED_LUMINANCE_CEILING)
  })
})

test.describe("SF-AD — trace 2: attachShadow() on an already-connected host, then synchronous population", () => {
  test("the shadow-internal surface actually themes dark, not merely non-native", async ({
    gate0,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)

    await traceAttachOnConnectedHost(page)
    await waitForSurfaceThemed(page)

    expect(await surfaceLuminance(page)).toBeLessThan(THEMED_LUMINANCE_CEILING)
  })
})

test.describe("SF-AD — trace 3: mutation inside an already-connected, pre-existing open root", () => {
  test("the shadow-internal surface actually themes dark once its own mutation gives it real evidence", async ({
    gate0,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await traceMutationSetup(page)
    await waitForClassification(page)

    await traceMutateExistingSurface(page)
    await waitForSurfaceThemed(page)

    expect(await surfaceLuminance(page)).toBeLessThan(THEMED_LUMINANCE_CEILING)
  })
})

test.describe("SF-AD — nested shadow roots, two levels deep (#1268's own acceptance criterion)", () => {
  test("a hardcoded-white surface inside a shadow root nested inside another shadow root themes correctly", async ({
    gate0,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)

    await page.evaluate(() => {
      const outerHost = document.createElement("div")
      outerHost.id = "nested-outer-host"
      const outerRoot = outerHost.attachShadow({ mode: "open" })
      const innerHost = document.createElement("div")
      innerHost.id = "nested-inner-host"
      outerRoot.appendChild(innerHost)
      const innerRoot = innerHost.attachShadow({ mode: "open" })
      const surface = document.createElement("div")
      surface.id = "nested-surface"
      surface.setAttribute(
        "style",
        "position:fixed;inset:0;z-index:999999;margin:0;padding:0;" +
          "background-color:rgb(255,255,255);"
      )
      innerRoot.appendChild(surface)
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(outerHost)
    })

    await page.waitForFunction(
      () => {
        const outerHost = document.getElementById("nested-outer-host")
        const innerHost =
          outerHost?.shadowRoot?.getElementById("nested-inner-host")
        const surface = innerHost?.shadowRoot?.getElementById("nested-surface")
        return surface?.dataset["swPatched"] !== undefined
      },
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const bg = await page.evaluate(() => {
      const outerHost = document.getElementById("nested-outer-host")
      const innerHost =
        outerHost?.shadowRoot?.getElementById("nested-inner-host")
      const surface = innerHost?.shadowRoot?.getElementById("nested-surface")
      return surface === null || surface === undefined
        ? null
        : getComputedStyle(surface).backgroundColor
    })
    expect(bg).not.toBeNull()
    if (bg === null) throw new Error("unreachable")
    const rgba = parseColor(bg)
    expect(rgba).not.toBeNull()
    if (rgba === null) throw new Error("unreachable")
    expect(relativeLuminance(rgba[0], rgba[1], rgba[2])).toBeLessThan(
      THEMED_LUMINANCE_CEILING
    )
  })
})

test.describe("SF-AD — a shadow host's own inherited foreground also lifts off a darkened surface, not just an explicit one", () => {
  // The surface declares no colour and inherits a dark foreground from its
  // host (`:host { color: #111 }`). No per-surface textCss fires for that, so
  // only buildHostTokenRule's `:host { color: var(--sw-text-0) !important }`
  // — the shadow equivalent of the document's canvas colour rule — fixes it,
  // by changing the host's computed colour.
  test("a surface with no explicit color of its own, inheriting a dark foreground from its host, reads light text once its background is darkened", async ({
    gate0,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)

    await page.evaluate(() => {
      const host = document.createElement("div")
      host.id = "host-color-inherit-host"
      host.style.color = "rgb(17, 17, 17)"
      const root = host.attachShadow({ mode: "open" })
      const surface = document.createElement("div")
      surface.id = "host-color-inherit-surface"
      surface.setAttribute(
        "style",
        "position:fixed;inset:0;z-index:999999;margin:0;padding:0;" +
          "background-color:rgb(255,255,255);"
      )
      surface.textContent = "hello"
      root.appendChild(surface)
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(host)
    })

    await page.waitForFunction(
      () => {
        const host = document.getElementById("host-color-inherit-host")
        const surface = host?.shadowRoot?.getElementById(
          "host-color-inherit-surface"
        )
        return surface?.dataset["swPatched"] !== undefined
      },
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const textColor = await page.evaluate(() => {
      const host = document.getElementById("host-color-inherit-host")
      const surface = host?.shadowRoot?.getElementById(
        "host-color-inherit-surface"
      )
      return surface === null || surface === undefined
        ? null
        : getComputedStyle(surface).color
    })
    expect(textColor).not.toBeNull()
    if (textColor === null) throw new Error("unreachable")
    const rgba = parseColor(textColor)
    expect(rgba, `unparseable computed color: ${textColor}`).not.toBeNull()
    if (rgba === null) throw new Error("unreachable")
    // The host's original colour has luminance ~0.006; the default swatch's
    // text0 (what the host rule forces) ~0.31.
    expect(relativeLuminance(rgba[0], rgba[1], rgba[2])).toBeGreaterThan(0.15)
  })
})
