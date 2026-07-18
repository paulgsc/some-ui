/**
 * platform/api — Firefox adapter.
 *
 * The `browser` global is injected by Firefox's WebExtensions runtime.
 * Re-exported so consumers get the canonical WebExtension type without
 * importing the global directly (which would break the Chromium build).
 *
 * Aliased in by vite.config.ts (firefox mode):
 *   resolve.alias["@filter/platform/content"] = ".../api.firefox.ts"
 */
export const ext: typeof browser = globalThis.browser
