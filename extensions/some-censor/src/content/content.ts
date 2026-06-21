/**
 * BOYO — content bundle entry point.
 *
 * Imports only from within src/content/ at runtime.
 * Type-only imports from src/types/ are erased at build time — safe.
 *
 * The Vite config (manualChunks: () => {}) ensures this compiles to a
 * self-contained IIFE with no shared runtime chunks.
 */
import "./content.css"

import { Controller } from "@censor/lib/content"

new Controller().init()

export {}
