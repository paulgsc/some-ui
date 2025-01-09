import tseslint from "typescript-eslint"

import {
  baseConfig,
  eslintPluginStorybook,
  reactConfig,
  tailwindConfig,
  testsOverrideConfig,
  toolsOverrideConfig,
  typescriptConfig,
} from "./configs/"

export default tseslint.config(
  ...baseConfig,
  ...typescriptConfig,
  ...tailwindConfig,
  ...reactConfig,
  ...eslintPluginStorybook,
  toolsOverrideConfig,
  testsOverrideConfig
)
