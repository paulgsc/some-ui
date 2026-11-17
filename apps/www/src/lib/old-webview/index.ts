/**
 * The phone's page for a WebView too old for the app (#3117), in place of a
 * blank white page: Capacitor loads it as `server.errorPath` below
 * `android.minWebViewVersion` (apps/mobile/capacitor.config.ts says why 111),
 * and only the phone build carries it. No script and no stylesheet, so any
 * WebView shows it. apps/mobile/review checks the APK carries it.
 */

/** Where the page is, under the build's root: Capacitor's `errorPath`. */
export const OLD_WEBVIEW_PAGE = "webview-too-old.html"

/** What the page says, in the person's terms. */
export const OLD_WEBVIEW_WORDS = {
  title: "This phone needs a newer WebView",
  body: "The app runs inside Android System WebView, and the one on this phone is too old to open it. Update Android System WebView from the Play Store (on Android 7 to 9, Chrome is usually the WebView: update Chrome), then open the app again.",
  updateWebView: "Update Android System WebView",
  updateChrome: "Update Chrome",
} as const

const ON_PLAY = "https://play.google.com/store/apps/details?id="
const BUTTON =
  "display:inline-block;margin:0 0.5rem 0.75rem 0;padding:0.75rem 1.25rem;border-radius:999px;background:#3b2a1e;color:#fff5e7;text-decoration:none"

/** The page, styled inline. The words go in as written: a test holds them to need no escaping. */
export function oldWebViewPage(): string {
  const { title, body, updateWebView, updateChrome } = OLD_WEBVIEW_WORDS
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${title}</title>`,
    "</head>",
    '<body style="margin:0;background:#fff5e7;color:#3b2a1e;font-family:sans-serif;line-height:1.5">',
    '<main style="max-width:32rem;margin:0 auto;padding:2rem 1.5rem">',
    `<h1 style="font-size:1.375rem;margin:0 0 1rem">${title}</h1>`,
    `<p style="margin:0 0 1.5rem">${body}</p>`,
    `<a href="${ON_PLAY}com.google.android.webview" style="${BUTTON}">${updateWebView}</a>`,
    `<a href="${ON_PLAY}com.android.chrome" style="${BUTTON}">${updateChrome}</a>`,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n")
}
