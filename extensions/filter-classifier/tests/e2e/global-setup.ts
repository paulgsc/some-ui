/**
 * Bundles the harness (`harness/entry.ts`) with esbuild before the suite
 * runs, mirroring `extensions/transport/tests/e2e/global-setup.ts`. The
 * harness imports the real, shipped classifier modules straight out of
 * `@some-extension/filter/src` (via that package's `./*` source export) —
 * bundling, rather than a package build step, is what lets a plain
 * Playwright page load them with no extension build involved.
 */

import { build } from "esbuild"

export default async function globalSetup(): Promise<void> {
  await build({
    entryPoints: ["tests/e2e/harness/entry.ts"],
    outfile: "tests/e2e/harness/dist/entry.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome110",
    sourcemap: "inline",
    logLevel: "warning",
  })
}
