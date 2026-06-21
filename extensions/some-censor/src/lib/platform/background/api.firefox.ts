

/**
 * platform/api — Firefox adapter.
 *
 * The `browser` global is injected by Firefox's WebExtensions runtime.
 * We re-export it typed as `typeof browser` so every consumer gets the
 * canonical WebExtension type without importing from the global namespace
 * directly (which would break the Chromium build).
 *
 * This file is aliased in by vite.config.firefox.ts via:
 *
 *   resolve.alias["@censor/platform/api"] = ".../api.firefox.ts"
 *
 * It is NEVER imported at build time for the Chromium target.
 */

// `browser` is a true ambient global in Firefox MV2 extension contexts —
// declared by @types/firefox-webext-browser.  No import needed.
export const ext: typeof browser = globalThis.browser
