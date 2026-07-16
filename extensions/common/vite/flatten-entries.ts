import {
  dirname,
  join as joinPosix,
  normalize as normalizePosix,
} from "node:path/posix"
import { rollup } from "rollup"
import type { Plugin as RollupPlugin } from "rollup"
import type { Plugin, Rollup } from "vite"

// This vite is rolldown-vite: its Plugin/generateBundle hooks are typed
// against rolldown's own OutputBundle (re-exported here as Rollup.*), which
// is structurally its own thing — not the real `rollup` package's types, even
// though the shapes mostly line up at runtime. The plugin-facing surface below
// types against vite's Rollup.* so it matches what generateBundle actually
// delivers; only the inner re-bundle step below uses the real `rollup`
// package (imported directly), which is a separate, self-contained build.
type OutputBundle = Rollup.OutputBundle

// One `vite build` emits every entry as ESM and lets Rollup hoist any module
// imported by 2+ entries into a shared chunk (its normal, tree-shaken,
// deduplicated optimum). This plugin runs afterwards and flattens that
// optimized graph back into one self-contained file per entry — no shared
// chunk survives.
//
// Why: content scripts, MV2 background scripts, and non-module MV3 service
// workers are executed by the browser as classic scripts. A surviving
// `import … from "./chunk.js"` in one of them throws
//   Uncaught SyntaxError: Cannot use import statement outside a module
// at load time. Classic entries are therefore emitted as IIFEs; module entries
// (popup/options) are emitted as self-contained ESM so the build produces the
// same one-file-per-entry `dist/` regardless of how the shared graph split.
//
// The flatten reuses Rollup itself (via `inlineDynamicImports`) over the
// already-emitted chunks rather than hand-rolling a concatenator, so all
// identifier de-conflicting, live-binding rewrites, and tree-shaking are
// Rollup's — correct by construction. See extensions/scripts/
// assert-self-contained.mjs, the CI gate that enforces the classic result.

/** An entry to flatten: its emitted file name and the format to re-bundle to. */
export type FlattenTarget = {
  /** The emitted entry file name, e.g. `content.js`. */
  fileName: string
  /** `iife` for classic contexts, `es` for module pages. */
  format: "iife" | "es"
}

/**
 * Re-bundle a single already-emitted entry chunk into one self-contained file.
 * Sibling chunks are resolved from the in-memory `bundle`; anything the bundle
 * doesn't contain (bare specifiers, `@vite-ignore`d runtime-URL dynamic
 * imports) stays external and untouched.
 */
async function inlineEntry(
  bundle: OutputBundle,
  entryFileName: string,
  format: "iife" | "es"
): Promise<string> {
  const virtualBundle: RollupPlugin = {
    name: "ext:virtual-bundle",
    resolveId(source, importer) {
      if (source === entryFileName || source in bundle) return source
      if (importer) {
        const resolved = normalizePosix(joinPosix(dirname(importer), source))
        if (resolved in bundle) return resolved
      }
      // Not a bundle chunk (a bare/external specifier, or a runtime-URL dynamic
      // import). Returning null leaves it external — Rollup keeps bare imports
      // out of the graph rather than erroring, which is what we want.
      return null
    },
    load(id) {
      const chunk = bundle[id]
      return chunk?.type === "chunk" ? chunk.code : null
    },
  }

  const build = await rollup({
    input: entryFileName,
    plugins: [virtualBundle],
    // Chunk code is already valid, optimized Rollup output; nested warnings
    // (unresolved bare externals, an IIFE with no exports) are expected.
    onwarn() {},
  })
  try {
    const { output } = await build.generate({
      format,
      inlineDynamicImports: true,
    })
    return output[0].code
  } finally {
    await build.close()
  }
}

/** Drop chunks no longer reachable from any surviving entry chunk. */
function pruneOrphanChunks(bundle: OutputBundle): void {
  const reachable = new Set<string>()
  const queue: Array<string> = []
  for (const [fileName, output] of Object.entries(bundle)) {
    if (output.type === "chunk" && output.isEntry) {
      reachable.add(fileName)
      queue.push(fileName)
    }
  }
  while (queue.length) {
    const fileName = queue.shift()
    if (fileName === undefined) continue
    const output = bundle[fileName]
    if (output?.type !== "chunk") continue
    for (const dep of [...output.imports, ...output.dynamicImports]) {
      if (!reachable.has(dep)) {
        reachable.add(dep)
        queue.push(dep)
      }
    }
  }
  for (const [fileName, output] of Object.entries(bundle)) {
    if (output.type === "chunk" && !output.isEntry && !reachable.has(fileName))
      delete bundle[fileName]
  }
}

/**
 * Vite plugin: flatten each named entry into a single self-contained file after
 * Rollup has optimized the shared graph, then prune every now-orphaned chunk.
 */
export function flattenEntries(targets: Array<FlattenTarget>): Plugin {
  const byFileName = new Map(
    targets.map((target) => [target.fileName, target.format])
  )
  return {
    name: "ext:flatten-entries",
    enforce: "post",
    async generateBundle(_options, bundle): Promise<void> {
      for (const fileName of Object.keys(bundle)) {
        const format = byFileName.get(fileName)
        if (!format) continue
        const chunk = bundle[fileName]
        if (chunk?.type !== "chunk") continue
        chunk.code = await inlineEntry(bundle, fileName, format)
        chunk.imports = []
        chunk.dynamicImports = []
      }
      pruneOrphanChunks(bundle)
    },
  }
}
