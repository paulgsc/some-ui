import { existsSync } from "fs"
import { resolve } from "path"
import react from "@vitejs/plugin-react"
import type { PluginOption } from "vite"
import dts from "vite-plugin-dts"

import type { ViteConfigOptions } from "../types/index.js"

export function createPlugins(
  options: ViteConfigOptions,
  packageRoot: string
): Array<PluginOption> {
  const {
    dtsOptions = {},
    additionalPlugins = [],
    contentPackage = false,
    contentPackageDataExclude,
  } = options

  const defaultExclude = [
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.stories.*",
    "**/__tests__/**",
    "**/__mocks__/**",
    "**/stories/**",
  ]

  // Packages that source-alias into the shared some-content / some-content-registry
  // /assets workspaces (packages/ui/* depth) exclude those cross-package paths,
  // plus their own demo/data fixtures, from declaration output. Keep new shared
  // content workspaces listed HERE (not in per-package vite.config dtsOptions) so
  // a single edit covers every consumer — see no-manual-build-exclude.
  const contentPackageExclude = contentPackage
    ? [
        "**/demo/**",
        ...(contentPackageDataExclude ?? ["**/data/**"]),
        "../../../assets/**/*",
        "../../some-content/src/**/*",
        "../../some-content-registry/src/**/*",
      ]
    : []

  const mergedExclude = [
    ...new Set([
      ...(dtsOptions.exclude ?? []),
      ...defaultExclude,
      ...contentPackageExclude,
    ]),
  ]

  // Single source of truth for the file set: point vite-plugin-dts at the
  // package's tsconfig.build.json when it exists, so the declaration-emit pass
  // and the `tsc -p tsconfig.build.json` typecheck pass are governed by the SAME
  // include/exclude. Without this, dts falls back to tsconfig.json (whose
  // `include` eagerly pulls in ../../some-content/**), and the only filter is the
  // dtsOptions.exclude list below — which then has to be hand-kept in sync with
  // tsconfig.build.json. The `exclude` globs above still layer on top as a
  // universal baseline (tests/stories/etc.) regardless of which tsconfig is used.
  const buildTsconfigPath = resolve(packageRoot, "tsconfig.build.json")
  const tsconfigPath = existsSync(buildTsconfigPath)
    ? { tsconfigPath: buildTsconfigPath }
    : {}

  const finalDtsOptions = {
    insertTypesEntry: true,
    ...tsconfigPath,
    ...dtsOptions,
    exclude: mergedExclude,
  }

  return [react(), dts(finalDtsOptions), ...additionalPlugins]
}
