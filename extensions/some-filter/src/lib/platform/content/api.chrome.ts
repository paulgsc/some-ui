/**
 * platform/api — Chromium adapter.
 *
 * Chromium MV3 exposes `chrome.*` rather than `browser.*`. The API surface
 * used by this extension (runtime, storage, tabs, commands) is identical.
 * The cast is safe for those call sites.
 *
 * Aliased in by vite.config.ts (chromium mode):
 *   resolve.alias["@filter/platform/content"] = ".../api.chrome.ts"
 *
 * Why not the webextension-polyfill?
 *   The polyfill is a runtime module. The shared extensionConfig flattens each
 *   entry into a single self-contained IIFE — but the polyfill's feature-detect
 *   logic runs after the IIFE is evaluated, producing a timing gap where
 *   `browser` is undefined. A static alias has no such gap.
 */
export const ext: typeof browser =
  // SAFETY: `chrome` implements the API surface we use in Chromium MV3 contexts.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  globalThis.chrome as unknown as typeof browser
