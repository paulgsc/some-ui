/**
 * The phone's page for a WebView too old for the app (#3117): a plain
 * "Update Android System WebView from the Play Store" instead of a blank
 * white page.
 *
 * The bundle is built for Vite's default target, `baseline-widely-available`
 * (Chrome 111). Capacitor checks the installed WebView before it loads
 * anything: below `android.minWebViewVersion` it loads `server.errorPath`
 * instead of the app (apps/mobile/capacitor.config.ts, where 111 is that
 * floor, to be raised with Vite's target, and the path repeats
 * `OLD_WEBVIEW_PAGE`). The phone build alone carries the page (vite.config.ts,
 * `oldWebViewPage`). It has no script and no stylesheet, so any WebView shows
 * it.
 */

/** Where the page is, under the build's root: Capacitor's `errorPath`. */
export const OLD_WEBVIEW_PAGE = "webview-too-old.html"

/** What the page says, in the person's terms. */
export const OLD_WEBVIEW_WORDS = {
  title: "This phone needs a newer WebView",
  body: "The app runs inside Android System WebView, and the one on this phone is too old to open it. Update Android System WebView from the Play Store, then open the app again.",
  action: "Update WebView in the Play Store",
} as const

const WEBVIEW_ON_PLAY =
  "https://play.google.com/store/apps/details?id=com.google.android.webview"

/**
 * The page, whole and styled inline. The words are fixed text with nothing
 * to escape; a test holds them to that.
 */
export function oldWebViewPage(): string {
  const { title, body, action } = OLD_WEBVIEW_WORDS
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
    `<a href="${WEBVIEW_ON_PLAY}" style="display:inline-block;padding:0.75rem 1.25rem;border-radius:999px;background:#3b2a1e;color:#fff5e7;text-decoration:none">${action}</a>`,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n")
}
