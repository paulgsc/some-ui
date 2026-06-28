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
