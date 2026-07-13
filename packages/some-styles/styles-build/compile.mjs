// Core single-pass Tailwind compiler for the some-ui monorepo.
//
// Every ui package and app shares one design layer (@some-ui/styles/tailwind.css:
// the Tailwind import, shadcn tokens, themes, plugins). The determinism bug this
// replaces came from compiling that layer once PER package — each package's own
// `vite build` ran an independent Tailwind pass scoped to its own source, and a
// consumer like apps/www then concatenated N pre-compiled stylesheets and ran an
// (N+1)th pass of its own. The merge order of those passes is derived from
// module-graph traversal, which a cold `pnpm install` in Docker can resolve
// differently than a warm local checkout — so styles that render in dev silently
// drop or reorder in the static build.
//
// This compiles the shared layer exactly ONCE over the explicit union of a
// dependency graph's source (the declared `@source` set), with scan `base`
// pointed at an empty directory so nothing leaks in from cwd auto-detection.
// One pass, one deterministic stylesheet, regardless of environment.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import tailwindcss from "@tailwindcss/postcss"
import postcss from "postcss"

import { CANONICAL_ENTRY, toSourceDirectives } from "./resolve-context.mjs"

/**
 * @typedef {object} CompileStylesOptions
 * @property {string[]} content            Absolute source globs to scan.
 * @property {string} [entry]              Absolute CSS entry. Defaults to the
 *                                         canonical @some-ui/styles/tailwind.css.
 * @property {string} [outFile]            Absolute output path. When set, the
 *                                         compiled CSS is written there.
 * @property {boolean} [minify]            Minify output. Defaults to true.
 */

/**
 * Compile the shared Tailwind layer in a single deterministic pass over
 * `content`. Returns the CSS; also writes it to `outFile` when provided.
 *
 * @param {CompileStylesOptions} options
 * @returns {Promise<{ css: string, outFile?: string }>}
 */
export async function compileStyles({
  content,
  entry = CANONICAL_ENTRY,
  outFile,
  minify = true,
}) {
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error(
      "compileStyles: `content` must be a non-empty array of globs"
    )
  }

  // An empty, throwaway scan base: Tailwind auto-detects candidates relative to
  // `base`, and we want ZERO auto-detection — only the explicit `@source` set
  // below decides what is scanned. That is what makes the output a pure
  // function of the declared graph.
  const scanBase = mkdtempSync(resolve(tmpdir(), "some-ui-styles-"))
  try {
    const input = `@import "${entry}";\n${toSourceDirectives(content)}\n`
    // `from` lives under the empty base; the entry is pulled in by absolute
    // path, so its own relative/package @imports still resolve against the
    // entry's real location.
    const from = resolve(scanBase, "__styles_entry__.css")
    const { css } = await postcss([
      tailwindcss({ base: scanBase, optimize: { minify } }),
    ]).process(input, { from })

    if (outFile) {
      mkdirSync(dirname(outFile), { recursive: true })
      writeFileSync(outFile, css)
    }
    return outFile ? { css, outFile } : { css }
  } finally {
    rmSync(scanBase, { recursive: true, force: true })
  }
}
