import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import type { PluginOption, UserConfig } from "vite"

import { copyFiles } from "./copy-files"
import type { CopyStep } from "./copy-files"
import { emitUnocss } from "./emit-unocss"
import type { UnocssBuild } from "./emit-unocss"
import { flattenEntries } from "./flatten-entries"
import type { FlattenTarget } from "./flatten-entries"

/** One build entry: a source module emitted as `dist/<name>.js`. */
export type ExtensionEntry = {
  /** Output stem; written as `dist/<name>.js`. */
  name: string
  /** Entry source relative to the extension root (an `.html` file for a page). */
  input: string
  /**
   * `true` (default) → classic execution context: content script, MV2
   * background script, or non-module MV3 service worker. Flattened to a single
   * self-contained IIFE so the browser's classic loader accepts it.
   * `false` → module context (popup/options page, module worker). Keeps its
   * chunks; loaded via `<script type="module">`.
   */
  classic?: boolean
}

export type ExtensionConfigOptions = {
  /** Build entries. Every classic entry is flattened; module entries are not. */
  entries: Array<ExtensionEntry>
  /** Import aliases, resolved against the extension root. */
  alias?: Record<string, string>
  /** Rollup externals (e.g. a wasm crate whose `dist/` isn't built at tsc time). */
  external?: Array<string>
  /** Files/dirs copied into `dist/` after the build (manifest overrides, wasm dist). */
  copy?: Array<CopyStep>
  /**
   * Ship the shared honeycomb brand mark (`extensions/common/brand/`) as
   * `dist/assets/icon-{16,48,128}.png` — the paths the manifests' `icons` and
   * `action.default_icon` declare — instead of per-extension copies in
   * `public/assets/` (#1420).
   */
  brandIcons?: boolean
  /** UnoCSS stylesheets to emit as part of the build (content/popup CSS). */
  unocss?: Array<UnocssBuild>
  /** Extra plugins, inserted before the flatten pass. */
  plugins?: Array<PluginOption>
}

// Rasterized from packages/some-styles/brand/favicon.svg (the canonical
// "Some UI" mark), at the sizes every extension manifest declares.
const BRAND_ICON_SIZES = [16, 48, 128] as const

function brandIconSteps(): Array<CopyStep> {
  const brandDir = fileURLToPath(new URL("../brand/", import.meta.url))
  return BRAND_ICON_SIZES.map((size) => ({
    from: resolve(brandDir, `icon-${size}.png`),
    to: `assets/icon-${size}.png`,
  }))
}

/**
 * The single source of truth for an extension's production build. One
 * `vite build` emits every entry; {@link flattenEntries} then rewrites each into
 * a single self-contained file (classic → IIFE, module page → ESM). Extension
 * `vite.config.ts` files are a one-line `export default extensionConfig({ … })`;
 * `pnpm dev` reuses the same config for the dev server (only the alias
 * resolution matters there).
 */
export function extensionConfig(options: ExtensionConfigOptions): UserConfig {
  const root = process.cwd()
  const {
    entries,
    alias = {},
    external = [],
    copy = [],
    brandIcons = false,
    unocss = [],
    plugins = [],
  } = options

  const input = Object.fromEntries(
    entries.map((entry) => [entry.name, resolve(root, entry.input)])
  )
  // Every entry is flattened to one self-contained file: classic entries as
  // IIFE (no import/export survives), module pages as self-contained ESM.
  const flattenTargets: Array<FlattenTarget> = entries.map((entry) => ({
    fileName: `${entry.name}.js`,
    format: entry.classic === false ? "es" : "iife",
  }))
  const copySteps = [...(brandIcons ? brandIconSteps() : []), ...copy]
  const resolvedAlias = Object.fromEntries(
    Object.entries(alias).map(([key, value]) => [key, resolve(root, value)])
  )

  return defineConfig({
    plugins: [
      ...plugins,
      flattenEntries(flattenTargets),
      ...(copySteps.length ? [copyFiles(copySteps)] : []),
      ...(unocss.length ? [emitUnocss(unocss)] : []),
    ],
    resolve: { tsconfigPaths: true, alias: resolvedAlias },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      // Every entry is flattened to a single self-contained file, so there are
      // no sibling chunks to preload — and injecting <link rel="modulepreload">
      // for chunks the flatten pass then prunes would leave dangling refs.
      modulePreload: false,
      // Rollup emits ESM here; the flatten pass rewrites the classic entries to
      // IIFE. Flat file names keep manifests referencing `content.js` etc.
      rolldownOptions: {
        input,
        external,
        output: {
          format: "es",
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          // JS-imported stylesheets (e.g. a content script's `import
          // "./content.css"`) land at dist/styles/<name>.css, where manifests
          // reference them ("css": ["styles/content.css"]).
          assetFileNames: "styles/[name][extname]",
        },
      },
    },
  })
}
