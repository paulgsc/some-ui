# AMO Notes to Reviewers — Ergonomic Page Filter

Ergonomic Page Filter darkens and recolours web pages for comfortable viewing,
toggled per tab from the popup, the context menu or Ctrl+Shift+F.

**Why `<all_urls>`:** the filter must work on any page the user opens, so the
content scripts (`prepaint-start.js` and `prepaint.css` at `document_start`,
`content.js` at `document_end`) run on all URLs. While the enforcement option
is on, `background.js` also registers `frame.js` (all frames) and uses
`scripting.insertCSS`. `tabs` lists open tabs in the popup and messages them;
`activeTab` applies the filter to the current tab; `contextMenus` provides the
page menu; `storage` holds settings; `scripting` handles the registration and
CSS injection above.

**How it works:** the content scripts read computed CSS colours and element
sizes to decide whether a page is light and which colours to override, then
inject `<style>` elements. They do not read page text, capture screenshots or
sample image pixels.

**Data handling:** everything is stored in `storage.local` only (never
`storage.sync`): per-tab filter state, settings, and a local diagnostics log.
For the extension's own Diagnostics page (popup → Diagnostics) the log keeps
the origin and title of up to 20 recent pages, plus per-page event logs of
colours, element tag names and states. Nothing leaves the device; the
Diagnostics page's "Export" button saves a JSON file locally at the user's
request.

**Network:** the extension makes no network requests. There are no remote
fonts, scripts or images (the popup shows a tab's favicon only when the browser
already holds it inline as a `data:` image), and no telemetry or analytics.
