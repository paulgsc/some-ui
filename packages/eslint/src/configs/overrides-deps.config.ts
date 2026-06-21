import { defineConfig } from "eslint/config"

export default defineConfig({
  files: [
    "**/*.config.*",
    "**/eslint.config.*",
    "**/vitest.setup.*",

    "**/*.stories.*",

    "**/*.test.*",
    "**/*.spec.*",

    "**/__tests__/**",
    "**/tests/**",
  ],

  rules: {
    "import/no-extraneous-dependencies": "off",
  },
})
