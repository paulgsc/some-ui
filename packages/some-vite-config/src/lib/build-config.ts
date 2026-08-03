import { resolve } from "path"

import type { ViteConfigOptions } from "../types/index.js"

/**
 * Absolute path to the package's library entry point. Single source of truth
 * for the `src/index.ts` default - the package.json sync uses this to prove
 * the packageRoot it was handed really is the package it just built.
 */
export function resolveEntryPath(
  options: ViteConfigOptions,
  packageRoot: string
): string {
  const { entry = "src/index.ts" } = options
  return resolve(packageRoot, entry)
}

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
  const { packageName, libraryName, formats = ["es", "cjs"] } = options

  const entryPath = resolveEntryPath(options, packageRoot)
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
