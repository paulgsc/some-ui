import react from "@vitejs/plugin-react"
import type { PluginOption } from "vite"
import dts from "vite-plugin-dts"
import tsConfigPaths from "vite-tsconfig-paths"

import type { ViteConfigOptions } from "../types/index.js"

export function createPlugins(options: ViteConfigOptions): PluginOption[] {
  const {
    dtsOptions = {},
    additionalPlugins = [],
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

  const mergedExclude = [
    ...new Set([...(dtsOptions.exclude ?? []), ...defaultExclude]),
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
