/**
 * The grammars `tokenizeCode` reads, each bound to the module that loads it.
 *
 * Prism's language components are plain scripts: each adds its grammar to
 * the global `Prism.languages` when it runs, and exports nothing. Two things
 * follow, both measured in www's own build (`apps/www/tests/ui-fit/code-card-fit.spec.ts`
 * fails on either):
 *
 * - They are bound, never imported bare: www builds with
 *   `treeshake.moduleSideEffects: false` (`apps/www/vite.config.ts`), which
 *   drops an import that binds nothing, and the grammar with it.
 * - Prism must have run first, and an import of Prism beside them is not
 *   enough: Prism is CommonJS, so a bundler runs it where its importer's own
 *   body starts, after these scripts. So Prism lives in `./core`, which
 *   `./index` imports before this module.
 *
 * Within this module the order is load-bearing too: C++ extends C's grammar.
 */

// A path reference, not a global `.d.ts`: this workspace is consumed from
// source, so its consumers type-check this file without loading an ambient
// declaration that nothing points at (the `CSSVarProperties` note in
// `../../types` says the same).
/// <reference path="./prism-grammars.d.ts" />

import * as prismC from "prismjs/components/prism-c"
import * as prismCpp from "prismjs/components/prism-cpp"
import * as prismRust from "prismjs/components/prism-rust"
import * as prismTypescript from "prismjs/components/prism-typescript"

export const GRAMMAR_MODULES = {
  c: prismC,
  cpp: prismCpp,
  rust: prismRust,
  typescript: prismTypescript,
} as const
