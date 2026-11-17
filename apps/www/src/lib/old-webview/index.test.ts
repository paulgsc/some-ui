import { describe, expect, it } from "vitest"

import {
  MIN_CHROME,
  OLD_WEBVIEW_WORDS,
  oldWebViewMarkup,
  oldWebViewScript,
} from "@/lib/old-webview"

/** Runs the inline script against a user agent; the body it leaves. */
function bodyAfter(userAgent: string, readyState = "complete"): string {
  const body = { innerHTML: '<div id="app"></div>' }
  const listeners: Array<() => void> = []
  const document = {
    readyState,
    body,
    addEventListener: (_: string, listener: () => void): void => {
      listeners.push(listener)
    },
  }
  // The script is a string the page runs as-is; this runs the same string.
  new Function("navigator", "document", oldWebViewScript())(
    { userAgent },
    document
  )
  for (const listener of listeners) listener()
  return body.innerHTML
}

const webView = (major: number): string =>
  `Mozilla/5.0 (Linux; Android 9; sdk_gphone_x86_64 Build/PSR1.180720.122; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${String(major)}.0.0.0 Mobile Safari/537.36`

describe("the phone's screen for a WebView too old for the app (#3117)", () => {
  it("sits at the floor Vite's default target names", () => {
    expect(MIN_CHROME).toBe(111)
  })

  it("replaces the page below the floor, once the document is parsed", () => {
    expect(bodyAfter(webView(69))).toBe(oldWebViewMarkup())
    expect(bodyAfter(webView(MIN_CHROME - 1), "loading")).toBe(
      oldWebViewMarkup()
    )
  })

  it("leaves the page alone at or above the floor, or with no Chrome named", () => {
    const app = '<div id="app"></div>'
    expect(bodyAfter(webView(MIN_CHROME))).toBe(app)
    expect(bodyAfter(webView(133))).toBe(app)
    expect(bodyAfter("Mozilla/5.0 (X11; Linux x86_64)")).toBe(app)
  })

  it("says what to do in the person's terms, and links to WebView on Play", () => {
    const markup = oldWebViewMarkup()
    expect(markup).toContain(OLD_WEBVIEW_WORDS.title)
    expect(markup).toContain(
      "Update Android System WebView from the Play Store"
    )
    expect(markup).toContain(
      "https://play.google.com/store/apps/details?id=com.google.android.webview"
    )
  })

  it("is ES5, since it runs where newer syntax does not", () => {
    const script = oldWebViewScript()
    for (const newer of ["=>", "const ", "let ", "`", "?.", "??"]) {
      expect(script).not.toContain(newer)
    }
  })
})
