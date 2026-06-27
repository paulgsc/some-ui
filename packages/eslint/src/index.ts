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
  testsOverrideConfig,
  toolsOverrideConfig,
  typescriptConfig,
} from "./configs/index.js"

/**
 * Full recommended preset
 */
export const maishatuRecommended: Config = defineConfig(
  ...baseConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...eslintPluginStorybook,
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
  ...eslintPluginStorybook,
  toolsOverrideConfig,
  testsOverrideConfig
)

// ── Extension configs ──────────────────────────────────────────────────────

export {
  extensionsSecurityConfig,
  extensionsCharterConfig,
  extensionCharterPlugin,
}

/**
 * Default export
 */
export default maishatuRecommended
