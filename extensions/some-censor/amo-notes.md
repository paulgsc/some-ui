# AMO Notes to Reviewers — BOYO Content Censor

## Host Permissions: `*://www.youtube.com/*`

The extension operates exclusively on www.youtube.com. Host permissions are
intentionally narrow: no other origin, including other YouTube subdomains
(m., music., studio.), is ever accessed. The content script, background worker,
and popup all communicate within the `youtube.com` boundary.

## Network Fetch: development-only

A localhost persistence API client (`ApiClient`, `src/lib/background/api-client.ts`)
exists to allow developer tooling to inspect and manage whitelist entries during
development. It is **unconditionally disabled in production builds** via a
`import.meta.env.PROD` guard that throws before any `fetch()` call is made.

In production, all state (whitelist entries, enabled flag) is stored exclusively
in `browser.storage.local`. No network requests are made.

## Data Collected: none

Channel IDs and the extension-enabled flag are stored in `browser.storage.local`
only, never transmitted. No page content, video titles, or browsing history leave
the browser.
