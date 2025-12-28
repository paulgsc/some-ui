import tseslint from "typescript-eslint"
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

export const maishatuRecommended: Config = {
  ...baseConfig,
  ...typescriptConfig,
  ...tailwindConfig,
  ...reactConfig,
  ...eslintPluginStorybook,
  ...toolsOverrideConfig,
  ...testsOverrideConfig,
}

export const maishatuNonStylistic: Config = {
  ...baseConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...eslintPluginStorybook,
  ...toolsOverrideConfig,
  ...testsOverrideConfig,
}

export default <Config>(
  tseslint.config(
    ...baseConfig,
    ...typescriptConfig,
    ...tailwindConfig,
    ...reactConfig,
    ...eslintPluginStorybook,
    toolsOverrideConfig,
    testsOverrideConfig
  )
)
