import { resolve } from "path"

import type { ViteConfigOptions } from "../types/index.js"

export function createResolveConfig(
  options: ViteConfigOptions,
  packageRoot: string
): { alias: Record<string, string> } {
  const { alias = {}, packageName } = options

  // Create default alias based on package name
  const defaultAlias = {
    [`@${packageName}`]: resolve(packageRoot, "src"),
  }

  return {
    alias: {
      ...defaultAlias,
      ...alias,
    },
  }
}
