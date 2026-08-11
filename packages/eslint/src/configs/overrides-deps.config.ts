import { defineConfig } from "eslint/config"

export default defineConfig({
  files: [
    "**/*.config.*",
    "**/eslint.config.*",
    "**/vitest.setup.*",

    "**/*.stories.*",

    // Storybook's own config and decorators. Dev-only tooling by definition —
    // it never ships — so react, @storybook/*, and friends are correctly
    // devDependencies of the root workspace. The `*.config.*` entry above
    // already covers .storybook/main.ts and uno.config.ts; the decorators are
    // the same category and only missed it on filename.
    ".storybook/**",

    "**/*.test.*",
    "**/*.spec.*",

    "**/__tests__/**",
    "**/tests/**",
  ],

  rules: {
    "import/no-extraneous-dependencies": "off",
  },
})
