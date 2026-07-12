#!/usr/bin/env node
// Builds content/background as independent self-contained IIFE bundles so the
// classic-context entries never import a shared Rollup chunk (e.g. a util
// hoisted into @some-extension/common). Inherits the per-target vite config
// (platform alias swap, manifest + polyhedron asset plugins) — only the input
// is driven per entry.
//   node scripts/build.mjs firefox   (default)
//   node scripts/build.mjs chromium
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildSelfContained } from "@some-extension/common/build"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const target = process.argv[2] === "chromium" ? "chromium" : "firefox"

await buildSelfContained({
  root,
  configFile: `vite.config.${target}.ts`,
  entries: [
    { name: "content", input: "src/content/content.ts", format: "iife" },
    {
      name: "background",
      input: "src/background/background.ts",
      format: "iife",
    },
  ],
})
