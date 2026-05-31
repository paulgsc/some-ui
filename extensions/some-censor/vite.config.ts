/**
 * vite.config.ts — default config (Firefox).
 *
 * This re-exports the Chromium config so that bare `vite build` and `vite dev`
 * continue to work without specifying --config. The canonical production builds
 * should use the explicit configs:
 
 *   pnpm build:firefox   → vite build --config vite.config.firefox.ts
 *   pnpm build:chromium  → vite build --config vite.config.chromium.ts
 *
 * The Chromium config is chosen as the default because it is what Playwright
 * uses, making local dev (pnpm dev + manual Chromium extension loading) the
 * lower-friction path.
 */
export { default } from "./vite.config.firefox"
