/**
 * vite.config.ts — default config (re-exports Firefox build).
 *
 * Canonical production builds use the explicit configs:
 *   pnpm build:firefox   → vite build --config vite.config.firefox.ts
 *   pnpm build:chromium  → vite build --config vite.config.chromium.ts
 *
 * The default re-exports Firefox because that is the primary distribution
 * target. Playwright E2E uses build:chromium explicitly.
 */
export { default } from "./vite.config.firefox"
