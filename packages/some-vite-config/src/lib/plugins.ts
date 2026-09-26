import react from "@vitejs/plugin-react"
import type { PluginOption } from "vite"

import type { ViteConfigOptions } from "@/types/index.js"

import { createDeclarationsPlugin } from "./declarations.js"

/**
 * The plugins every library build runs.
 *
 * Declarations are not generated here. The package's own
 * `tsc -p tsconfig.build.json`, which runs before `vite build` and is the
 * build's type-check gate, writes them; `createDeclarationsPlugin` only
 * publishes what it wrote (see ./declarations.ts for the intent and the
 * assumptions it checks). Which files get a declaration is decided by
 * `tsconfig.build.json`'s include/exclude alone - there is no second list.
 */
export function createPlugins(
  options: ViteConfigOptions,
  packageRoot: string
): Array<PluginOption> {
  const { additionalPlugins = [] } = options
  return [
    react(),
    createDeclarationsPlugin(options, packageRoot),
    ...additionalPlugins,
  ]
}
