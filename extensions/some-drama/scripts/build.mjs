#!/usr/bin/env node
// Builds content/background as independent self-contained IIFE bundles and the
// popup as its own ES module, so classic-context entries never import a shared
// Rollup chunk. See @some-extension/common/build for the why.
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildSelfContained } from "@some-extension/common/build"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

await buildSelfContained({
  root,
  configFile: "vite.config.ts", // supplies the @drama alias
  entries: [
    // Classic contexts (MV2 content script + background script): IIFE.
    { name: "content", input: "src/content/content.ts", format: "iife" },
    {
      name: "background",
      input: "src/background/background.ts",
      format: "iife",
    },
    // Popup is loaded via <script type="module">, so ES output is fine.
    { name: "popup", input: "popup.html", format: "es" },
  ],
})
