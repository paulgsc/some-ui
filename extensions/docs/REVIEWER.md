# AMO Reviewer Gateway

> One-stop entry point for Mozilla AMO reviewers. Every host-permission
> justification, data-collection declaration, and source-review note is
> either recorded here or linked from this document.

---

## Quick-reference: permissions at a glance

| Extension                             | MV  | `host_permissions`    | `permissions`                                                               | `data_collection` |
| ------------------------------------- | --- | --------------------- | --------------------------------------------------------------------------- | ----------------- |
| [some-filter](#some-filter)           | 3   | `<all_urls>`          | `activeTab` `storage` `tabs`                                                | `none`            |
| [suspender-ledger](#suspender-ledger) | 3   | `*://*/*`             | `idle` `storage` `contextMenus` `notifications` `alarms` `scripting` `tabs` | `none`            |
| [some-censor](#some-censor)           | 3   | `*://*.youtube.com/*` | `storage`                                                                   | `none`            |
| [some-mujik](#some-mujik)             | 3   | `<all_urls>`          | `activeTab` `storage` `tabs`                                                | `none`            |
| [some-conveyor](#some-conveyor)       | 3   | `<all_urls>`          | `storage` `tabs` `activeTab` `scripting`                                    | `none`            |

---

## Further reading

| Document                                  | Purpose                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| [AMO Compliance Guide](amo-compliance.md) | Full process guide: sign cycle, footgun taxonomy (A/B/C blocks), source-archive checklist |

---

## some-filter

**What it does:** Injects a CSS luminance/colour-temperature filter on any page
the user visits. The user can toggle and configure it per-tab via the popup.

**Why `<all_urls>`:** The filter must apply to every page the user browses. There
is no predefined origin list — narrowing it would silently stop the filter from
working on most sites.

**Data collected:** None. All processing (luminance detection, CSS injection) runs
locally inside the content script. No network requests are made.

→ [Host-permission justification](../some-filter/amo-notes.md)

---

## suspender-ledger

**What it does:** Replaces inactive browser tabs with a lightweight suspend page
(`suspend.html`) to reclaim RAM. On explicit user click the original URL is
restored.

**Why `*://*/*`:** The suspender must be able to intercept and replace any tab,
regardless of its origin. Narrowing to specific domains would make the extension
useless on the majority of tabs.

**Why `tabs`:** Required to query active/inactive tabs, detect the current URL,
send messages to content scripts, and programmatically navigate tabs on restore.

**Data collected:** None. Only the original URL + title are stored locally (in the
suspend page's query string) to enable the restore. No browsing history is
transmitted off-device.

→ [Host-permission justification](../suspender-ledger/amo-notes.md)

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

---

## some-conveyor

**What it does:** Injects a rotating polyhedron widget (backed by a WASM state
machine) into any page the user visits as a general-purpose overlay tool.

**Why `<all_urls>`:** The widget is designed to be available on any page. The user
activates it via the popup; restricting it to specific origins would break the
intended general-purpose behaviour.

**Why `scripting`:** Used to programmatically inject scripts in response to popup
commands, in addition to the always-on content script.

**Data collected:** None. The WASM module runs entirely within the extension
sandbox. No network requests are made.

→ [Host-permission justification](../some-conveyor/amo-notes.md)
