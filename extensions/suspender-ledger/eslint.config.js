import { defineConfig } from "eslint/config"
import { extensionsRecommended } from "maishatu-eslint-kit"

export default defineConfig(...extensionsRecommended, {
  files: ["scripts/**/*.{js,mjs}"],
  rules: {
    "no-console": "off",
    "no-process-exit": "off",
    "unicorn/no-process-exit": "off",
  },
})
