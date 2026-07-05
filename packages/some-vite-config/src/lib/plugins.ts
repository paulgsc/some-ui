import react from "@vitejs/plugin-react"
import type { PluginOption } from "vite"
import dts from "vite-plugin-dts"
import tsConfigPaths from "vite-tsconfig-paths"

import type { ViteConfigOptions } from "../types/index.js"

export function createPlugins(options: ViteConfigOptions): PluginOption[] {
  const {
    dtsOptions = {},
    additionalPlugins = [],
    contentPackage = false,
    tsConfigPaths: { projects = ["./tsconfig.json"] } = {},
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
        "**/data/**",
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

  return [
    react(),
    dts(finalDtsOptions),
    tsConfigPaths({ projects }),
    ...additionalPlugins,
  ]
}
