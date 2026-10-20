import { readFileSync } from "fs"
import { resolve } from "path"
import type { UserConfig } from "vite"
import { defineConfig } from "vite"

import {
  createBuildConfig,
  createPackageJsonPlugin,
  createPlugins,
  createResolveConfig,
  createRollupOptions,
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

  const config: UserConfig = {
    // The package.json sync is a build-lifecycle plugin, NOT something that
    // runs while this config object is being built. Evaluating a
    // vite.config.ts must stay free of filesystem writes: knip loads every
    // workspace's vite config to discover entry points, and when the sync ran
    // eagerly here that read-only analysis rewrote each package's manifest.
    plugins: [
      ...createPlugins(options, packageRoot),
      ...(shouldUpdatePackageJson
        ? [createPackageJsonPlugin(options, packageRoot)]
        : []),
    ],
    resolve: createResolveConfig(options),
    build: {
      ...createBuildConfig(options, packageRoot),
      rolldownOptions: createRollupOptions(options, externalDeps),
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

export {
  audiencePlugin,
  BUILD_PROFILE_MODULE,
  type AudiencePluginOptions,
  type GatedAudience,
} from "./audience/plugin.js"
