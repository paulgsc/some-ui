import { resolve } from "node:path"
import { defineConfig, type UserConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"
import type { BuildContext } from "./types.js"

/**
 * Turns a build.context.ts into a `pnpm dev` config: only what the Vite dev
 * server needs (alias resolution), none of the per-entry production build
 * logic — that lives in build/run.mjs. Extension vite.config.ts files should
 * be a one-line wrapper around this; see extensions/some-drama/vite.config.ts.
 */
export function createDevConfig(
  context: BuildContext,
  target = "default"
): UserConfig {
  const ctx = context[target] ?? context.default
  const root = process.cwd()
  const alias = Object.fromEntries(
    Object.entries(ctx?.alias ?? {}).map(([key, value]) => [
      key,
      resolve(root, value),
    ])
  )
  return defineConfig({
    plugins: [tsconfigPaths()],
    resolve: { alias },
  })
}
