import { readFileSync } from "fs"
import { resolve } from "path"
import type { UserConfig } from "vite"
import { defineConfig } from "vite"

import {
  createBuildConfig,
  createPlugins,
  createResolveConfig,
  createRollupOptions,
  updatePackageJson,
} from "./lib/index.js"
import type { ViteConfigOptions } from "./types/index.js"

export * from "./types/index.js"

// Keys of a package.json dependency map, read defensively off an untyped parse.
function depKeys(pkg: Record<string, unknown>, field: string): Array<string> {
  const value = pkg[field]
  return typeof value === "object" && value !== null ? Object.keys(value) : []
}

export function createViteConfig(
  options: ViteConfigOptions,
  packageRoot: string = process.cwd()
): UserConfig {
  const { updatePackageJson: shouldUpdatePackageJson = true } = options

  // Read package.json to get dependencies
  let pkg: Record<string, unknown> = {}
  try {
    const packageJsonPath = resolve(packageRoot, "package.json")
    const packageJsonContent = readFileSync(packageJsonPath, "utf-8")
    const parsed: Record<string, unknown> = JSON.parse(packageJsonContent)
    pkg = parsed
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      "Could not read package.json, external dependencies will not be automatically detected"
    )
  }

  const externalDeps = [
    ...depKeys(pkg, "dependencies"),
    ...depKeys(pkg, "peerDependencies"),
    ...depKeys(pkg, "devDependencies"),
  ]

  // Update package.json with build configuration
  if (shouldUpdatePackageJson) {
    try {
      updatePackageJson(options, packageRoot)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to update package.json:", error)
    }
  }

  const config: UserConfig = {
    plugins: createPlugins(options, packageRoot),
    resolve: createResolveConfig(options, packageRoot),
    // esbuild: {
    //   // This removes console.log and debugger statements
    //   // drop: ["console", "debugger"],
    // },
    build: {
      minify: true, // Ensure minification is on so esbuild drops the logs
      ...createBuildConfig(options, packageRoot),
      rollupOptions: createRollupOptions(options, externalDeps),
    },
  }

  // Apply any config overrides
  if (options.configOverrides) {
    return defineConfig({
      ...config,
      ...options.configOverrides,
    })
  }

  return defineConfig(config)
}

// Convenience function for common React library setup
export function createReactLibConfig(
  options: Omit<ViteConfigOptions, "libraryName"> & { libraryName?: string }
): UserConfig {
  return createViteConfig({
    ...options,
    libraryName:
      options.libraryName ||
      `${options.packageName.replace(/[-_]/g, "")}Library`,
  })
}

// Command to just update package.json without creating Vite config
export function syncPackageJson(
  options: ViteConfigOptions,
  packageRoot: string = process.cwd()
): Record<string, unknown> {
  return updatePackageJson(options, packageRoot)
}
