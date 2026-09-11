/**
 * SF-AD (#1268) follow-ups #1280 and #1281 — both found on PR #1279's own
 * closing review (round 5) and deliberately not fixed there per
 * `.claude/skills/steward/SKILL.md`'s capped-review rule (a substantive
 * finding on a capped PR's closing review gets filed, not folded in).
 *
 * Both e2e cases below drive the real built extension (`dist/`, via
 * `@filter/playwright/fixture`'s `--load-extension`), not a synthetic unit
 * context — the unit suites (`shadow-scope-theming.test.ts`,
 * `shadow-actuator.test.ts`) already cover the underlying logic in
 * isolation; these prove the same fixes hold once wired through the real
 * pipeline end to end.
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

    // No data-sw-patched signal exists for a scope with zero evidenced
    // surfaces (nothing gets tagged) — poll the host's own computed color
    // directly instead; it starts as the browser's default (black,
    // rgb(0, 0, 0)) and only changes once this scope's own :host token rule
    // (buildHostTokenRule) actually commits.
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

    // getComputedStyle never reflects `filter` compositing (#741) — it
    // reports the literal declared value. invert(1) is an exact per-channel
    // complement (CSS Filter Effects Level 1); replicate that here to get
    // what a human actually sees once the page's own vendor filter composites
    // this declared value.
    const asSeen: [number, number, number] = [
      1 - rgba[0],
      1 - rgba[1],
      1 - rgba[2],
    ]
    const asSeenLuminance = relativeLuminance(...asSeen)

    // Without compensation the host's own :host{color} rule is built from
    // the raw swatch's text0 (a light token, luminance ~0.31 per SF-AD's own
    // round-5 e2e fixture) — composited through the page's own invert(1)
    // that reads back dark, well under this bar. With compensation the
    // *declared* value is text0's own counter-invert, which composites back
    // to text0 itself once rendered.
    expect(
      asSeenLuminance,
      `declared computed color ${declaredColor}, composited through the ` +
        `page's own filter: invert(1), reads as luminance ` +
        `${asSeenLuminance.toFixed(3)} — expected light text, got dark`
    ).toBeGreaterThan(0.15)
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

    // The vendor's own reactive-stylesheet update (a real, documented
    // pattern — Lit/FAST-style libraries reassign adoptedStyleSheets
    // wholesale to apply their own changes) — a plain CSSOM property write,
    // not a DOM mutation, so no MutationObserver anywhere reacts to it.
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

    // shadow-scope-theming.ts's own SHEET_INTEGRITY_POLL_MS (250ms) integrity
    // poll notices the missing sheets on a later tick and repairs them —
    // with no other mutation of any kind to react to.
    await page.waitForFunction(
      () => {
        const host = document.getElementById("reassignment-host")
        const surface = host?.shadowRoot?.getElementById("reassignment-surface")
        if (surface === undefined || surface === null) return false
        const bg = getComputedStyle(surface).backgroundColor
        // Anything other than the untouched native white counts as
        // "repaired" for this poll — the luminance assertion right after
        // this wait is the real, precise check.
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
