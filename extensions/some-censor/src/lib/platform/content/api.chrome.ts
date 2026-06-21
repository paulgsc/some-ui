
/**
 * platform/api — Chromium adapter.
 *
 * Chromium MV3 exposes `chrome.*` rather than `browser.*`.  The API surface
 * we use is identical: runtime.sendMessage / onMessage / storage / tabs.
 * The cast is safe for those call sites.
 *
 * This file is aliased in by vite.config.chromium.ts via:
 *
 *   resolve.alias["@censor/platform/api"] = ".../api.chrome.ts"
 *
 * It is NEVER imported at build time for the Firefox target.
 *
 * Why not the webextension-polyfill?
 *   The polyfill is a runtime module.  With manualChunks: () => {} Vite inlines
 *   all imports into a single IIFE — but the polyfill's own feature-detect
 *   logic runs after the IIFE is evaluated, producing a timing gap where
 *   `browser` is undefined.  A static alias has no such gap.
 */

// `chrome` is a true ambient global in Chromium MV3 extension contexts —
// declared by the `chrome` types package.
export const ext: typeof browser =
  // SAFETY:
  // In Chromium environments, `chrome` implements the API surface we use.
  // This cast is the boundary between the browser runtime and our typed wrapper.
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  globalThis.chrome as unknown as typeof browser
