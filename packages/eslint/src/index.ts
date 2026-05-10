// @ts-check
import { defineConfig } from "eslint/config"
import type { Config } from "typescript-eslint"

import {
  baseConfig,
  eslintPluginStorybook,
  reactConfig,
  tailwindConfig,
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
  ...tailwindConfig,
  ...reactConfig,
  ...eslintPluginStorybook,
  toolsOverrideConfig,
  testsOverrideConfig
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
