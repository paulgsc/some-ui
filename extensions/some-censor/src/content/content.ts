/**
 * BOYO — content bundle entry point.
 *
 * Imports only from within src/content/ at runtime.
 * Type-only imports from src/types/ are erased at build time — safe.
 *
 * The Vite config (manualChunks: () => {}) ensures this compiles to a
 * self-contained IIFE with no shared runtime chunks.
 *
 * No stylesheet import: the content CSS is a *standalone* file referenced from
 * the manifest's `content_scripts[].css`, not a JS-injected style. It is
 * emitted at `dist/styles/content.css` by the UnoCSS step in vite.config.ts,
 * from `styles/content.css` plus the utilities declared in
 * `lib/content/veil-styles.ts`.
 */
import { Controller } from "@censor/lib/content"

new Controller().init()

export {}
