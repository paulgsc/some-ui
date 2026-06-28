# AMO Notes to Reviewers — Suspender Ledger

This extension operates as a tab suspender and must access every URL the user
visits (`*://*/*`) in order to monitor tab activity, detect unsaved form input,
and replace inactive tabs with a themed suspend page. Narrowing the host
permission to specific domains would break the core functionality of the
extension, which is to manage RAM usage across all browser tabs regardless of
their origin.

No page content, tab data, or user activity is transmitted off-device; all
processing is local. The content script (`watch.js`) only tracks whether the
page has unsaved form input and the time of the last visibility change — both
are used solely to decide whether a tab is safe to suspend.

## Content Security Policy

All extension HTML surfaces (popup, suspend) run under an explicit, restrictive
CSP declared in the manifest: `script-src 'self'; object-src 'self'`. No inline
or remote script is used — every page loads a single bundled module from the
extension's own origin.

## Suspended-tab presentation (deceptive-pattern mitigation)

The suspend page (`suspend.html`) never reflects a suspended tab's original
title or favicon verbatim. The tab-strip title always carries a marker prefix
(e.g. `💤 …`, never the bare original), the favicon is the extension's own inline
"sleep" badge rather than the parked site's icon, and the page body displays a
visible "Tab suspended by Suspender Ledger" header. This makes the suspended
state unambiguous and ensures the page never impersonates the origin it parked.
