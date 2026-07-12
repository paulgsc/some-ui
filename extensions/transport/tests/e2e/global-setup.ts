/**
 * Bundles the S11 harness (`harness/entry.ts`) with esbuild before the
 * suite runs. Transport ships raw `.ts` source with no build step of its
 * own (S1/S7) — this bundling is scoped entirely to the test harness, a
 * fixture, not a build artifact of the package itself.
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
