/**
 * The phone's screen for a WebView too old for the app (#3117): a plain
 * "Update Android System WebView from Play" instead of a blank white page.
 *
 * The bundle is built for Vite's default target, `baseline-widely-available`
 * (Chrome 111, `MIN_CHROME`). On an older WebView its module fails to parse
 * and nothing renders, so the check cannot live in the bundle: the phone's
 * `index.html` carries `oldWebViewScript()` inline, as a classic script that
 * any WebView runs (vite.config.ts, `oldWebViewNotice`, mobile profile only).
 * A phone updated from Play is past the floor; an emulator image's stock
 * WebView, or a phone that never updated it, may not be
 * (apps/mobile/README.md, "Stamping a release's Android compatibility").
 */

/**
 * The oldest Chrome the bundle runs on: Vite 8's `baseline-widely-available`
 * target is `chrome111`. apps/mobile/compat/run-level.sh's `MIN_WEBVIEW`
 * holds the same number for the compatibility stamp.
 */
export const MIN_CHROME = 111

/** What the screen says, in the person's terms. */
export const OLD_WEBVIEW_WORDS = {
  title: "This phone needs a newer WebView",
  body: "The app runs inside Android System WebView, and the one on this phone is too old to open it. Update Android System WebView from the Play Store, then open the app again.",
  action: "Open it in Play",
} as const

/** Android System WebView's page on Play, which the phone opens in Play. */
const WEBVIEW_ON_PLAY =
  "https://play.google.com/store/apps/details?id=com.google.android.webview"

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/**
 * The screen's markup, styled inline: no stylesheet may have loaded, and the
 * theme script may have darkened the page, so it paints its own light
 * background over all of it (top/right/bottom/left: `inset` is newer than
 * the WebViews it is for).
 */
export function oldWebViewMarkup(
  words: typeof OLD_WEBVIEW_WORDS = OLD_WEBVIEW_WORDS
): string {
  return (
    '<div style="position:fixed;top:0;right:0;bottom:0;left:0;overflow:auto;background:#fff5e7">' +
    '<main style="font-family:sans-serif;max-width:32rem;margin:0 auto;padding:2rem 1.5rem;color:#3b2a1e;line-height:1.5">' +
    `<h1 style="font-size:1.375rem;margin:0 0 1rem">${escapeHtml(words.title)}</h1>` +
    `<p style="margin:0 0 1.5rem">${escapeHtml(words.body)}</p>` +
    `<a href="${WEBVIEW_ON_PLAY}" style="display:inline-block;padding:0.75rem 1.25rem;border-radius:999px;background:#3b2a1e;color:#fff5e7;text-decoration:none">${escapeHtml(words.action)}</a>` +
    "</main></div>"
  )
}

/**
 * The inline script: ES5 only, since it runs exactly where newer syntax does
 * not. Below `MIN_CHROME` it puts the screen in the body once the document
 * is parsed, which also takes away #app, so nothing else mounts there. A
 * user agent naming no Chrome version is left alone.
 */
export function oldWebViewScript(min: number = MIN_CHROME): string {
  return (
    "(function(){" +
    "var m=/Chrome\\/(\\d+)/.exec(navigator.userAgent);" +
    `if(!m||Number(m[1])>=${String(min)})return;` +
    `var html=${JSON.stringify(oldWebViewMarkup())};` +
    "function show(){document.body.innerHTML=html;}" +
    'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",show);else show();' +
    "})()"
  )
}
