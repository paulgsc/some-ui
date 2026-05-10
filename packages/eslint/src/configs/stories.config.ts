//@ts-check
import storybook from "eslint-plugin-storybook"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...storybook.configs["flat/recommended"],
  {
    files: ["**/*.stories.tsx"],
    rules: {
      "import/no-anonymous-default-export": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-mixed-operators": "off",
    },
  },
])
