#!/usr/bin/env node
// Shared extension build runner — invoked as `some-ext-build [target]` from
// each extension's package.json (cwd = that extension's root, set by pnpm).
//
// Reads ./build.context.ts (a plain BuildContext object, see types.ts) and
// runs each entry as its own single-input Rollup build. A module has a single
// consumer per build, so Rollup inlines it into that entry's output instead
// of extracting it into a shared chunk — the source of the classic-context
// "Cannot use import statement outside a module" footgun. See
// extensions/scripts/assert-self-contained.mjs, which enforces the result.
//
// Why not one multi-entry vite build with manualChunks? Rollup always hoists
// a module imported by 2+ entries into a chunk; manualChunks decides WHICH
// chunk, not whether one is created. There is no config that prevents the
// split within a single multi-entry graph — only running entries as
// independent graphs does.
import { copyFileSync, cpSync, existsSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { build, loadConfigFromFile } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

const root = process.cwd()
const target = process.argv[2] || "default"

const loaded = await loadConfigFromFile(
  { command: "build", mode: "production" },
  resolve(root, "build.context.ts"),
  root
)
if (!loaded) {
  throw new Error(`some-ext-build: no build.context.ts found in ${root}`)
}

const contexts = loaded.config
const context = contexts[target]
if (!context) {
  throw new Error(
    `some-ext-build: build.context.ts has no "${target}" target (available: ${Object.keys(contexts).join(", ")})`
  )
}

const { entries, alias = {}, external = [], copy = [] } = context

const resolvedAlias = Object.fromEntries(
  Object.entries(alias).map(([key, value]) => [key, resolve(root, value)])
)

for (let i = 0; i < entries.length; i++) {
  const { name, input, format = "iife" } = entries[i]
  await build({
    root,
    configFile: false,
    // extensions/common pins vite@^6.0.7 (older than the rest of the
    // monorepo's vite@8), which predates native resolve.tsconfigPaths -
    // this subtree still needs the plugin.
    plugins: [tsconfigPaths()],
    resolve: { alias: resolvedAlias },
    build: {
      outDir: "dist",
      // Only the first entry clears dist (and re-copies public/); later
      // entries append their single output file.
      emptyOutDir: i === 0,
      rollupOptions: {
        input: { [name]: resolve(root, input) },
        external,
        output: { entryFileNames: `${name}.js`, format },
      },
    },
  })
}

for (const { from, to } of copy) {
  const src = resolve(root, from)
  const dst = resolve(root, "dist", to)
  if (!existsSync(src)) {
    throw new Error(`some-ext-build: copy source missing: ${src}`)
  }
  if (statSync(src).isDirectory()) {
    cpSync(src, dst, { recursive: true, force: true })
  } else {
    copyFileSync(src, dst)
  }
  // eslint-disable-next-line no-console
  console.log(`[some-ext-build] copied ${from} -> dist/${to}`)
}
