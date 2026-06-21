import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"

import {
  baseConfig,
  depsOverrideConfig,
  eslintPluginStorybook,
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

/**
 * Default export
 */
export default maishatuRecommended
