// Shared self-contained extension builder.
//
// content scripts and MV2 background scripts run as classic scripts and
// cannot use ESM import/export; a non-module MV3 service worker is the same.
// Vite/Rollup only avoids extracting shared code into a separate chunk when a
// module has a single consumer — with several entries in one Rollup graph,
// anything imported by 2+ entries (e.g. a util hoisted into
// @some-extension/common) is hoisted into a shared chunk that those entries
// then `import`, which throws "Cannot use import statement outside a module"
// at load. `manualChunks: () => {}` does NOT prevent this: it returns
// undefined, so Rollup still splits.
//
// buildSelfContained runs each entry as its own single-input Rollup graph, so
// shared code has only one consumer per build and is inlined directly into
// that entry's output instead of extracted. The extension's own vite config
// (aliases, plugins, manifest handling, asset naming) is reused verbatim via
// configFile — only the input is overridden, one entry at a time.
//
// enforced in CI by extensions/scripts/assert-self-contained.mjs.
import { resolve } from "node:path"
import { build, loadConfigFromFile, mergeConfig } from "vite"

/**
 * @param {object}   opts
 * @param {string}   opts.root        extension root (absolute)
 * @param {string}  [opts.configFile] vite config to inherit (relative to root)
 * @param {Array<{name: string, input: string, format?: "iife" | "es"}>} opts.entries
 *   Each built as an independent single-input bundle. `input` is relative to
 *   root. `format` defaults to "iife" (safe for every classic context; a
 *   module service worker or module <script> loads an import-free IIFE fine).
 */
export async function buildSelfContained({ root, configFile, entries }) {
  let base = {}
  if (configFile) {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" },
      resolve(root, configFile),
      root
    )
    if (!loaded) throw new Error(`could not load vite config: ${configFile}`)
    base = loaded.config
    // The base config's multi-entry input is what causes the shared chunk;
    // drop it and drive input per entry below. Everything else (plugins,
    // resolve.alias, output.assetFileNames, ...) is inherited.
    if (base.build?.rollupOptions) delete base.build.rollupOptions.input
    // A single-input build implies output.inlineDynamicImports, which Rollup
    // refuses to combine with manualChunks. The inherited `manualChunks` is a
    // no-op for one entry anyway (it never prevented the shared chunk), so drop
    // it to avoid the conflict.
    const inheritedOutput = base.build?.rollupOptions?.output
    if (inheritedOutput && !Array.isArray(inheritedOutput))
      delete inheritedOutput.manualChunks
  }

  for (let i = 0; i < entries.length; i++) {
    const { name, input, format = "iife" } = entries[i]
    await build(
      mergeConfig(base, {
        root,
        configFile: false,
        build: {
          outDir: "dist",
          // Only the first entry clears dist (and re-copies public/); later
          // entries append their single output file.
          emptyOutDir: i === 0,
          rollupOptions: {
            // Object form keeps `name` as the chunk name for any inherited
            // entryFileNames logic; the explicit override below wins anyway.
            input: { [name]: resolve(root, input) },
            output: { entryFileNames: `${name}.js`, format },
          },
        },
      })
    )
  }
}
