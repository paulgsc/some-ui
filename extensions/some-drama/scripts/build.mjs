#!/usr/bin/env node
// content.js and background.js are executed by the browser as classic
// scripts (MV2 background, content_scripts) and cannot use ESM
// import/export. Vite/Rollup only avoids splitting shared code into a
// separate chunk when a module has nowhere else to go — with multiple
// entries in one Rollup graph, anything imported by 2+ entries (e.g.
// @some-extension/common) is hoisted into a shared chunk that those
// entries then `import`, which throws at load time in a classic script.
//
// Building each entry as its own independent Rollup graph (one `input`
// per invocation) removes the "somewhere else to go": shared code has
// only one consumer per build, so Rollup inlines it directly into that
// entry's single output file instead of extracting it.
//
// See extensions/scripts/assert-self-contained.mjs, which enforces this
// invariant in CI.
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = resolve(root, "dist")
const alias = { "@drama": resolve(root, "src") }

async function buildEntry({ name, input, format, emptyOutDir }) {
  await build({
    root,
    configFile: false,
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir,
      rollupOptions: {
        input,
        output: {
          entryFileNames: `${name}.js`,
          format,
        },
      },
    },
  })
}

// Classic-context entries: IIFE guarantees zero import/export in the output.
await buildEntry({
  name: "content",
  input: resolve(root, "src/content/content.ts"),
  format: "iife",
  emptyOutDir: true,
})
await buildEntry({
  name: "background",
  input: resolve(root, "src/background/background.ts"),
  format: "iife",
  emptyOutDir: false,
})

// Popup is loaded via <script type="module">, so ESM output is fine — it's
// alone in its own Rollup graph here too, so it ends up self-contained anyway.
await buildEntry({
  name: "popup",
  input: resolve(root, "popup.html"),
  format: "es",
  emptyOutDir: false,
})
