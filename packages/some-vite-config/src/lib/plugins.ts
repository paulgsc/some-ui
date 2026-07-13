import react from "@vitejs/plugin-react"
import type { PluginOption } from "vite"
import dts from "vite-plugin-dts"

import type { ViteConfigOptions } from "../types/index.js"

export function createPlugins(options: ViteConfigOptions): Array<PluginOption> {
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

  // Packages that source-alias into the shared some-content/assets
  // workspaces (packages/ui/* depth) exclude those cross-package paths,
  // plus their own demo/data fixtures, from declaration output.
  const contentPackageExclude = contentPackage
    ? [
        "**/demo/**",
        ...(contentPackageDataExclude ?? ["**/data/**"]),
        "../../../assets/**/*",
        "../../some-content/src/**/*",
      ]
    : []

  const mergedExclude = [
    ...new Set([
      ...(dtsOptions.exclude ?? []),
      ...defaultExclude,
      ...contentPackageExclude,
    ]),
  ]

  const finalDtsOptions = {
    insertTypesEntry: true,
    ...dtsOptions,
    exclude: mergedExclude,
  }

  return [react(), dts(finalDtsOptions), ...additionalPlugins]
}
