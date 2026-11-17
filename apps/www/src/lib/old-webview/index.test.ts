import { describe, expect, it } from "vitest"

import { OLD_WEBVIEW_WORDS, oldWebViewPage } from "@/lib/old-webview"

describe("the phone's page for a WebView too old for the app (#3117)", () => {
  it("links to WebView and to Chrome on Play", () => {
    const page = oldWebViewPage()
    for (const app of ["com.google.android.webview", "com.android.chrome"]) {
      expect(page).toContain(
        `href="https://play.google.com/store/apps/details?id=${app}"`
      )
    }
  })

  it("puts its words in the page as written, with nothing to escape", () => {
    for (const words of Object.values(OLD_WEBVIEW_WORDS)) {
      expect(words).not.toMatch(/[<>&"]/)
    }
  })

  it("loads nothing, so a WebView too old for the bundle shows it", () => {
    const page = oldWebViewPage()
    expect(page).not.toMatch(/<script|<link|src=/)
  })
})
