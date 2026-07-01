import { resolve } from "path"

import type { ViteConfigOptions } from "../types/index.js"

export function createBuildConfig(
  options: ViteConfigOptions,
  packageRoot: string
): {
  lib: {
    entry: string
    name: string
    fileName: (format: string) => string
    formats: NonNullable<ViteConfigOptions["formats"]>
  }
} {
  const {
    packageName,
    entry = "src/index.ts",
    libraryName,
    formats = ["es", "cjs"],
  } = options

  const entryPath = resolve(packageRoot, entry)
  const defaultLibraryName =
    libraryName ||
    packageName.replace(/[-_]/g, "").replace(/^./, (c) => c.toUpperCase())

  return {
    lib: {
      entry: entryPath,
      name: defaultLibraryName,
      fileName: (format: string): string => `${packageName}.${format}.js`,
      formats,
    },
  }
}
