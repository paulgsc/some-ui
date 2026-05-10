//@ts-check
import eslintPluginStorybook from "eslint-plugin-storybook"
import type { ConfigWithExtends } from "typescript-eslint"

const config: Array<ConfigWithExtends> = [
  {
    files: ["**/*.stories.tsx"],
    plugins: {
      storybook: eslintPluginStorybook,
    },
    extends: [...eslintPluginStorybook.configs["flat/recommended"]],
    rules: {
      "import/no-anonymous-default-export": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-mixed-operators": "off",
    },
  },
]

export default config
