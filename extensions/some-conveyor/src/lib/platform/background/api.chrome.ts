/**
 * platform/background/api — Chromium adapter.
 *
 * Chromium MV3 exposes `chrome.*` rather than `browser.*`. The API surface
 * used by the conveyor service worker (tabs) is identical.
 *
 * Aliased in by vite.config.chromium.ts:
 *   resolve.alias["@censor/platform/background"] = ".../background/api.chrome.ts"
 *
 * Kept in a separate background/ directory from content/ so Rollup's
 * manualChunks: () => {} cannot accidentally pull both into a shared chunk.
 */
export const ext: typeof browser =
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  globalThis.chrome as unknown as typeof browser
