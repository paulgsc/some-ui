/**
 * vite.config.ts — re-exports the Firefox MV3 build.
 *
 * Firefox is the only distribution target; there is no Chromium variant.
 * Playwright E2E (when added) will use Firefox via web-ext + CDP bridge.
 */
export { default } from "./vite.config.firefox"
