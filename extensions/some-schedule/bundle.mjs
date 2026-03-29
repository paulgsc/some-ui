/**
 * scripts/bundle.mjs
 *
 * Bundles the three extension entry points independently.
 * Each output is a self-contained IIFE — no shared chunks,
 * matching the existing tabsched extension pattern.
 *
 * Outputs:
 *   dist/background.js   ← service worker (esm module)
 *   dist/content.js      ← content script (iife)
 *   dist/popup.js        ← popup script (iife)
 */

import { mkdir } from "fs/promises"
import * as esbuild from "esbuild"

await mkdir("dist", { recursive: true })

const sharedOptions = {
  bundle: true,
  sourcemap: process.env.NODE_ENV !== "production",
  minify: process.env.NODE_ENV === "production",
  target: ["chrome109", "firefox109"],
}

// Background service worker — must be ESM module format for MV3
await esbuild.build({
  ...sharedOptions,
  entryPoints: ["src/background/index.ts"],
  outfile: "dist/background.js",
  format: "esm",
  platform: "browser",
})

// Content script — IIFE, injected into arbitrary pages
await esbuild.build({
  ...sharedOptions,
  entryPoints: ["src/content/index.ts"],
  outfile: "dist/content.js",
  format: "iife",
  platform: "browser",
})

// Popup script — IIFE, runs in extension popup context
await esbuild.build({
  ...sharedOptions,
  entryPoints: ["src/popup/index.ts"],
  outfile: "dist/popup.js",
  format: "iife",
  platform: "browser",
})

console.log("Bundle complete → dist/")
