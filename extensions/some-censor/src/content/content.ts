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
 * the manifest's `content_scripts[].css`, not a JS-injected style. The build
 * copies `styles/content.css` to `dist/styles/content.css` as written.
 */
import { Controller } from "@censor/lib/content"

new Controller().init()

export {}
