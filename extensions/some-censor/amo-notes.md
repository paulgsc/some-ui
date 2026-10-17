# AMO Notes to Reviewers — BOYO Content Censor

## Host Permissions: `*://www.youtube.com/*`

The extension operates exclusively on www.youtube.com. Host permissions are
intentionally narrow: no other origin, including other YouTube subdomains
(m., music., studio.), is ever accessed. The content script runs only there;
the popup and the diagnostics page are the extension's own pages.

## Permissions

- `storage`: the settings (the boundary and the on/off switch) and the
  diagnostics recordings, in `browser.storage.local`.
- `contextMenus`: one "Open diagnostics" item on the tab context menu.

## Network requests: none

The extension makes no network requests.

## Data collected: none

The settings and the diagnostics recordings stay in `browser.storage.local`,
on this device. The recordings hold upload-date text, video IDs and counts,
never a title, channel or thumbnail. Nothing leaves the browser.
