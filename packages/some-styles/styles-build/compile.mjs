// Core single-pass Tailwind compiler for the some-ui monorepo.
//
// Every ui package and app shares one design layer (@some-ui/styles/tailwind.css).
// Compiling it once per package and concatenating the results lets module-graph
// order decide the cascade, which differs between a cold Docker install and a
// warm checkout. So this compiles the layer exactly once over the declared
// `@source` union, with scan `base` an empty directory so nothing leaks in from
// cwd auto-detection: one deterministic stylesheet in any environment.
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

  // An empty scan base: no auto-detection, only the explicit `@source` set.

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
