import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"

import {
  baseConfig,
  depsOverrideConfig,
  eslintPluginStorybook,
  extensionCharterPlugin,
  extensionsCharterConfig,
  extensionsSecurityConfig,
  reactConfig,
  reactPeerDependencyConfig,
  switchLintConfig,
  switchLintPlugin,
  tailwindIdiomConfig,
  tailwindIdiomPlugin,
  testsOverrideConfig,
  toolsOverrideConfig,
  typescriptConfig,
  wasmLoaderGuardConfig,
} from "./configs/index.js"

/**
 * Full recommended preset
 */
export const maishatuRecommended: Config = defineConfig(
  ...baseConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...reactPeerDependencyConfig,
  ...eslintPluginStorybook,
  ...wasmLoaderGuardConfig,
  ...switchLintConfig,
  ...tailwindIdiomConfig,
  toolsOverrideConfig,
  testsOverrideConfig,
  depsOverrideConfig
)

/**
 * Non-stylistic preset
 */
export const maishatuNonStylistic: Config = defineConfig(
  ...baseConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...reactPeerDependencyConfig,
  ...eslintPluginStorybook,
  ...wasmLoaderGuardConfig,
  ...tailwindIdiomConfig,
  toolsOverrideConfig,
  testsOverrideConfig
)

// ── Extension configs ──────────────────────────────────────────────────────

export {
  extensionsSecurityConfig,
  extensionsCharterConfig,
  extensionCharterPlugin,
}

// ── Switch-statement idiom rules ───────────────────────────────────────────
export { switchLintConfig, switchLintPlugin }

// ── Tailwind static-classname idiom rules ──────────────────────────────────
export { tailwindIdiomConfig, tailwindIdiomPlugin }

/**
 * Recommended preset for browser-extension workspaces.
 * Extends maishatuRecommended with AMO security rules and Good-Citizen Charter lints.
 */
export const extensionsRecommended: Config = [
  ...maishatuRecommended,
  ...extensionsSecurityConfig,
  ...extensionsCharterConfig,
]

/**
 * Default export
 */
export default maishatuRecommended
