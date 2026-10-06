/**
 * Shadow-scope theming follow-ups #1280 and #1281, through the real built
 * extension (the unit suites cover the logic in isolation).
 *
 * Classification (#1360): visual claims, sound. The #1281 cases compensate
 * for the getComputedStyle-vs-`filter` gap by computing the "as seen through
 * invert(1)" luminance by hand; the #1280 case reads `background-color` with
 * no filter involved.
 */

import { parseColor, relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import type { Page } from "@playwright/test"

async function surfaceBackgroundLuminance(
  page: Page,
  hostId: string,
  surfaceId: string
): Promise<number> {
  const bg = await page.evaluate(
    ({ hostId, surfaceId }) => {
      const host = document.getElementById(hostId)
      const surface = host?.shadowRoot?.getElementById(surfaceId)
      return surface === null || surface === undefined
        ? null
        : getComputedStyle(surface).backgroundColor
    },
    { hostId, surfaceId }
  )
  expect(bg, `${surfaceId} not found`).not.toBeNull()
  if (bg === null) throw new Error("unreachable")
  const rgba = parseColor(bg)
  expect(rgba, `unparseable computed background-color: ${bg}`).not.toBeNull()
  if (rgba === null) throw new Error("unreachable")
  return relativeLuminance(rgba[0], rgba[1], rgba[2])
}

// ── #1281 — vendor-invert compensation for the shadow scope's own :host tokens ──

test.describe("SF-AD follow-up #1281 — shadow :host tokens survive a vendor's own filter: invert(1)", () => {
  test("a shadow host with no explicit color of its own reads as light text once composited through the page's own invert(1)", async ({
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-vendor-invert-page")
    await waitForClassification(page)

    await page.evaluate(() => {
      const host = document.createElement("div")
      host.id = "vendor-invert-shadow-host"
      host.attachShadow({ mode: "open" })
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(host)
    })

    // A scope with zero evidenced surfaces tags nothing, so poll the host's
    // computed colour: default black until the :host token rule commits.
    await page.waitForFunction(
      () => {
        const host = document.getElementById("vendor-invert-shadow-host")
        if (host === null) return false
        return getComputedStyle(host).color !== "rgb(0, 0, 0)"
      },
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const declaredColor = await page.evaluate(() => {
      const host = document.getElementById("vendor-invert-shadow-host")
      return host === null ? null : getComputedStyle(host).color
    })
    expect(declaredColor).not.toBeNull()
    if (declaredColor === null) throw new Error("unreachable")
    const rgba = parseColor(declaredColor)
    expect(rgba, `unparseable computed color: ${declaredColor}`).not.toBeNull()
    if (rgba === null) throw new Error("unreachable")

    // getComputedStyle reports the declared value; invert(1) is an exact
    // per-channel complement (CSS Filter Effects Level 1), replicated here.
    const asSeen: [number, number, number] = [
      1 - rgba[0],
      1 - rgba[1],
      1 - rgba[2],
    ]
    const asSeenLuminance = relativeLuminance(...asSeen)

    // Uncompensated, the :host colour (light text0) composites dark through
    // invert(1); compensated, it declares text0's counter-invert, which
    // composites back to text0.
    expect(
      asSeenLuminance,
      `declared computed color ${declaredColor}, composited through the ` +
        `page's own filter: invert(1), reads as luminance ` +
        `${asSeenLuminance.toFixed(3)} — expected light text, got dark`
    ).toBeGreaterThan(0.15)
  })

  test("a classified surface's own emit-surface-color background also survives the page's own invert(1), not just the :host tokens", async ({
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-vendor-invert-page")
    await waitForClassification(page)

    await page.evaluate(() => {
      const host = document.createElement("div")
      host.id = "vendor-invert-surface-host"
      const root = host.attachShadow({ mode: "open" })
      const surface = document.createElement("div")
      surface.id = "vendor-invert-surface"
      surface.setAttribute(
        "style",
        "position:fixed;inset:0;z-index:999999;margin:0;padding:0;" +
          "background-color:rgb(255,255,255);"
      )
      root.appendChild(surface)
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(host)
    })

    await page.waitForFunction(
      () => {
        const host = document.getElementById("vendor-invert-surface-host")
        const surface = host?.shadowRoot?.getElementById(
          "vendor-invert-surface"
        )
        return surface?.dataset["swPatched"] !== undefined
      },
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const bg = await page.evaluate(() => {
      const host = document.getElementById("vendor-invert-surface-host")
      const surface = host?.shadowRoot?.getElementById("vendor-invert-surface")
      return surface === null || surface === undefined
        ? null
        : getComputedStyle(surface).backgroundColor
    })
    expect(bg).not.toBeNull()
    if (bg === null) throw new Error("unreachable")
    const rgba = parseColor(bg)
    expect(rgba, `unparseable computed background-color: ${bg}`).not.toBeNull()
    if (rgba === null) throw new Error("unreachable")

    // Same "asSeen" method: uncompensated, the dark background composites
    // bright through invert(1).
    const asSeenLuminance = relativeLuminance(
      1 - rgba[0],
      1 - rgba[1],
      1 - rgba[2]
    )
    expect(
      asSeenLuminance,
      `declared computed background ${bg}, composited through the page's ` +
        `own filter: invert(1), reads as luminance ` +
        `${asSeenLuminance.toFixed(3)} — expected dark, got bright`
    ).toBeLessThan(0.3)
  })
})

// ── #1280 — self-repair after a vendor's own wholesale adoptedStyleSheets reassignment ──

test.describe("SF-AD follow-up #1280 — reconciles a committed shadow scope after a vendor's own wholesale adoptedStyleSheets reassignment", () => {
  test("a shadow surface silently reverted to native by a wholesale reassignment re-themes on its own, with no further mutation", async ({
    fixture,
  }) => {
    const page = await fixture.goto("shadow-surface-page")
    await waitForClassification(page)

    await page.evaluate(() => {
      const host = document.createElement("div")
      host.id = "reassignment-host"
      const root = host.attachShadow({ mode: "open" })
      const surface = document.createElement("div")
      surface.id = "reassignment-surface"
      surface.setAttribute(
        "style",
        "position:fixed;inset:0;z-index:999999;margin:0;padding:0;" +
          "background-color:rgb(255,255,255);"
      )
      root.appendChild(surface)
      const anchor = document.getElementById("host-anchor")
      if (anchor === null) throw new Error("fixture missing #host-anchor")
      anchor.appendChild(host)
    })

    await page.waitForFunction(
      () => {
        const host = document.getElementById("reassignment-host")
        const surface = host?.shadowRoot?.getElementById("reassignment-surface")
        return surface?.dataset["swPatched"] !== undefined
      },
      undefined,
      { timeout: 5_000, polling: 100 }
    )
    expect(
      await surfaceBackgroundLuminance(
        page,
        "reassignment-host",
        "reassignment-surface"
      )
    ).toBeLessThan(0.3)

    // A vendor's reactive-stylesheet update (Lit/FAST reassign
    // adoptedStyleSheets wholesale): a CSSOM write no observer sees.
    await page.evaluate(() => {
      const host = document.getElementById("reassignment-host")
      const root = host?.shadowRoot
      if (root === null || root === undefined) {
        throw new Error("reassignment-host has no shadowRoot")
      }
      root.adoptedStyleSheets = []
    })

    // Confirms the simulated vendor action actually reverted the surface —
    // establishes the bug is real before proving the fix repairs it.
    expect(
      await surfaceBackgroundLuminance(
        page,
        "reassignment-host",
        "reassignment-surface"
      )
    ).toBeGreaterThan(0.7)

    // The 250ms integrity poll (SHEET_INTEGRITY_POLL_MS) repairs it with no
    // other mutation to react to.
    await page.waitForFunction(
      () => {
        const host = document.getElementById("reassignment-host")
        const surface = host?.shadowRoot?.getElementById("reassignment-surface")
        if (surface === undefined || surface === null) return false
        const bg = getComputedStyle(surface).backgroundColor
        // Anything but native white counts; the luminance check below is
        // the precise one.
        return bg !== "rgb(255, 255, 255)"
      },
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    expect(
      await surfaceBackgroundLuminance(
        page,
        "reassignment-host",
        "reassignment-surface"
      )
    ).toBeLessThan(0.3)
  })
})
