/**
 * SF-AD (#1268) — the direct regression test for issue #1262's own reported
 * repro: a hardcoded-white surface inside `attachShadow({ mode: "open" })`
 * must actually get *themed* (dark), not merely non-leaking. SF-DC's own
 * `issue-1267-sfdc-shadow-custody.spec.ts` proved the frame-oracle half of
 * this (zero native-bright frames) — deliberately narrower than #1262's own
 * symptom, since SF-DC's scopes never left `HELD` (see that module's own
 * header). This spec proves the other half: once discovered and held, the
 * surface's own computed background actually converges on the dark swatch's
 * output, the same way an identical light-DOM surface already does.
 *
 * Reuses SF-DC's own three G0.2 creation-trace drivers
 * (`shadow-traces.ts`) — the same independent "populate" vs. "connect" vs.
 * "mutate" orderings, now checked for the *positive* claim (themed) rather
 * than only the negative one (never native-bright) — plus a new nested-root
 * case (#1268's own acceptance criterion: "at least two levels deep").
 *
 * `getComputedStyle().backgroundColor` is enough here, unlike
 * `pixels.ts`/`frames.ts`'s screenshot/frame oracle: `emit-surface-color`'s
 * realization is an ordinary CSS `background-color` rule (via
 * `ShadowRoot.adoptedStyleSheets`), not a `filter` — computed style already
 * reflects it directly, with no compositing gap to account for.
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
 * Below `theme-adapter.ts`'s own `LIGHT_THRESHOLD` (0.3) — the white
 * surface's original luminance is 1.0, so anything crossing this bar has
 * unambiguously moved to the dark side, without this spec needing to
 * replicate `modify-colors.ts`'s exact hue-preserving math to know the
 * precise target color a given swatch produces.
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
