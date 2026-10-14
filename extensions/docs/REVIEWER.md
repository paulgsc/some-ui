# AMO Reviewer Gateway

> One-stop entry point for Mozilla AMO reviewers. Every host-permission
> justification, data-collection declaration, and source-review note is
> either recorded here or linked from this document.

---

## Quick-reference: permissions at a glance

| Extension                             | MV  | `host_permissions`    | `permissions`                                                               | `data_collection` |
| ------------------------------------- | --- | --------------------- | --------------------------------------------------------------------------- | ----------------- |
| [some-filter](#some-filter)           | 3   | `<all_urls>`          | `activeTab` `storage` `tabs` `contextMenus` `scripting`                     | `none`            |
| [suspender-ledger](#suspender-ledger) | 3   | `*://*/*`             | `idle` `storage` `contextMenus` `notifications` `alarms` `scripting` `tabs` | `none`            |
| [some-censor](#some-censor)           | 3   | `*://*.youtube.com/*` | `storage`                                                                   | `none`            |
| [some-mujik](#some-mujik)             | 3   | `<all_urls>`          | `activeTab` `storage` `tabs`                                                | `none`            |

---

## Further reading

| Document                                  | Purpose                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| [AMO Compliance Guide](amo-compliance.md) | Full process guide: sign cycle, footgun taxonomy (A/B/C blocks), source-archive checklist |

---

## some-filter

**What it does:** Darkens and recolours any page the user visits by injecting
CSS, decided from the page's computed colours. The user can toggle and
configure it per tab via the popup, the context menu or a shortcut.

**Why `<all_urls>`:** The filter must apply to every page the user browses. There
is no predefined origin list — narrowing it would silently stop the filter from
working on most sites.

**Data collected:** None. Settings, per-tab state and a local diagnostics log
live in `storage.local`; nothing leaves the device. No network requests are
made: no remote fonts, scripts or images (remote favicons included), and no
telemetry.

→ [Host-permission justification](../some-filter/amo-notes.md)

---

## suspender-ledger

**What it does:** Suspends background tabs to reclaim memory, using the browser's
native `tabs.discard()`. A discarded tab keeps its place, URL, title and history;
activating it reloads the page as an ordinary navigation. There is no suspend
page: the old `suspend.html` was removed in 0.2.1, and the extension never
navigates a tab to an extension URL. It never closes a tab.

**Why `*://*/*`:** Two content scripts run on every http(s) page. `watch.js`
(`document_idle`) tracks whether the page holds unsaved form input and when it
was last visible, so a tab with unsaved work is never suspended. `resume-veil.js`
(`document_start`) paints a dark cover over a page that is reloading after a
discard, so a light page does not flash. Before discarding, the worker also reads
those flags from the page with `scripting.executeScript`. The user can suspend
any tab, so narrowing the host list would leave most tabs unprotected.

**Why the other permissions:** `tabs` to find, discard and switch between tabs;
`scripting` for the pre-discard check and the optional title marker (a "💤 "
prefix on the page's own `document.title`, removed on resume; the user can turn
it off); `alarms` for the periodic sweep; `idle` for the optional "only
suspend while the computer is idle" setting and to reschedule the sweep when the
system wakes; `storage` for settings and the local diagnostics log;
`contextMenus` for the tab and page menus; `notifications` for a short message
when a menu action cannot be carried out.

**Data collected:** None. Nothing is sent anywhere; there is no network code.
Settings live in `storage.local`. A local diagnostics log (`storage.local`, at
most 500 events and 256 KB) records the extension's own decisions with tabs
identified by origin only. It leaves the machine only if the user clicks
"Export JSON" on `debug.html`, which saves a file.

→ [Per-version reviewer detail](../suspender-ledger/amo-notes.md)

---

## some-censor

**What it does:** Progressively masks YouTube video cards until the user explicitly
reveals them, preventing algorithmic recommendation noise.

**Why `*://*.youtube.com/*`:** The extension operates exclusively on YouTube.
Host permissions are intentionally narrow — no other origin is needed.

**Data collected:** None. Whitelist entries (channel IDs) and the enabled flag are
persisted in `browser.storage.local` only. A development-only localhost API client
(`ApiClient`) exists but is gated by `import.meta.env.PROD` and never executes in
production builds.

→ [Scope and data-collection notes](../some-censor/amo-notes.md)

---

## some-mujik

**What it does:** Shows an ambient waveform overlay card on whatever page the user
is currently browsing, reflecting the track playing in a background YouTube Music
tab.

**Why `<all_urls>`:** A single content script determines its role at runtime:
_source_ on YouTube tabs (reads now-playing metadata) and _display_ on all other
tabs (shows the overlay). The display role must work on any page the user is
viewing, so the matches cannot be restricted to a fixed list of origins.

**Data collected:** None. The background script only routes now-playing metadata
(title, artist, video ID) between the extension's own content-script instances.
No tab URLs, browsing history, or page content are exfiltrated.

→ [Host-permission justification](../some-mujik/amo-notes.md)
