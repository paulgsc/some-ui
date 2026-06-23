/**
 * platform/content/api — Chromium adapter.
 *
 * Chromium MV3 exposes `chrome.*` rather than `browser.*`. The API surface
 * used by conveyor content scripts (runtime, storage) is identical.
 *
 * Aliased in by vite.config.chromium.ts:
 *   resolve.alias["@conveyor/platform/content"] = ".../content/api.chrome.ts"
 *
 * Kept in a separate content/ directory from background/ so Rollup's
 * manualChunks: () => {} cannot accidentally pull both into a shared chunk.
 */
export const ext: typeof browser =
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  globalThis.chrome as unknown as typeof browser
