/**
 * Diagnostics entry-point typestate tests.
 *
 * `diagnosticsMenuId`/`isDiagnosticsMenuClick`/`diagnosticsMenuItem` are pure
 * string logic and run directly in the Playwright test-runner (Node.js)
 * process, same as the click-gate suite. `diagnosticsLink` builds real DOM
 * nodes, so — same as the keybindings suite — its source is injected into a
 * page via eval and exercised there.
 */

import {
  diagnosticsLink,
  diagnosticsMenuId,
  diagnosticsMenuItem,
  isDiagnosticsMenuClick,
} from "@common/lib/diagnostics"
import { expect, test } from "@playwright/test"

// ─────────────────────────────────────────────────────────────────────────────
// diagnosticsMenuId — namespaced id
// ─────────────────────────────────────────────────────────────────────────────

test.describe("diagnosticsMenuId", () => {
  test("namespaces the id so workspaces can never collide", () => {
    expect(diagnosticsMenuId("sw")).toBe("sw-open-diagnostics")
    expect(diagnosticsMenuId("bc")).toBe("bc-open-diagnostics")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isDiagnosticsMenuClick — click matcher
// ─────────────────────────────────────────────────────────────────────────────

test.describe("isDiagnosticsMenuClick", () => {
  const id = diagnosticsMenuId("bc")

  test("matches the exact id", () => {
    expect(isDiagnosticsMenuClick(id, id)).toBe(true)
  })

  test("matches a numeric menuItemId coerced to the same string", () => {
    expect(isDiagnosticsMenuClick("42", "42")).toBe(true)
  })

  test("does not match a different workspace's id", () => {
    expect(isDiagnosticsMenuClick(diagnosticsMenuId("sw"), id)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// diagnosticsMenuItem — contextMenus.create() payload
// ─────────────────────────────────────────────────────────────────────────────

test.describe("diagnosticsMenuItem", () => {
  test("defaults the title to 'Open diagnostics'", () => {
    expect(diagnosticsMenuItem("bc")).toEqual({
      id: "bc-open-diagnostics",
      title: "Open diagnostics",
    })
  })

  test("accepts a workspace-supplied title", () => {
    expect(diagnosticsMenuItem("bc", "Diagnostics…")).toEqual({
      id: "bc-open-diagnostics",
      title: "Diagnostics…",
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// diagnosticsLink — popup footer DOM
// ─────────────────────────────────────────────────────────────────────────────

const INLINE_DIAGNOSTICS_LINK = `
  globalThis.diagnosticsLink = ${diagnosticsLink.toString()};
`

test.describe("diagnosticsLink", () => {
  test("builds a footer > a.popup__diagnostics pointing at href", async ({
    page,
  }) => {
    await page.setContent(`<body></body>`)
    const result = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["diagnosticsLink"] as (opts: {
        href: string
        tooltip: string
        label?: string
      }) => HTMLElement
      const footer = fn({
        href: "chrome-extension://abc/debug.html",
        tooltip: "Health, metrics and the event timeline",
      })
      document.body.appendChild(footer)

      const link = footer.querySelector("a")
      return {
        footerTag: footer.tagName,
        footerClass: footer.className,
        linkClass: link?.className,
        href: link?.getAttribute("href"),
        target: link?.getAttribute("target"),
        rel: link?.getAttribute("rel"),
        text: link?.textContent,
        title: link?.getAttribute("title"),
      }
    }, INLINE_DIAGNOSTICS_LINK)

    expect(result).toEqual({
      footerTag: "FOOTER",
      footerClass: "popup__footer",
      linkClass: "popup__diagnostics",
      href: "chrome-extension://abc/debug.html",
      target: "_blank",
      rel: "noopener",
      text: "Diagnostics",
      title: "Health, metrics and the event timeline",
    })
  })

  test("accepts a custom label", async ({ page }) => {
    await page.setContent(`<body></body>`)
    const text = await page.evaluate((inline) => {
      eval(inline) // eslint-disable-line no-eval
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any
      const fn = (window as any)["diagnosticsLink"] as (opts: {
        href: string
        tooltip: string
        label?: string
      }) => HTMLElement
      const footer = fn({
        href: "chrome-extension://abc/debug.html",
        tooltip: "tooltip",
        label: "Diagnostics…",
      })
      return footer.querySelector("a")?.textContent
    }, INLINE_DIAGNOSTICS_LINK)

    expect(text).toBe("Diagnostics…")
  })
})
