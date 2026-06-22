import { defineConfig } from "eslint/config"
import someUIEslint from "maishatu-eslint-kit"

export default defineConfig(...someUIEslint, {
  files: ["scripts/**/*.{js,mjs}"],
  rules: {
    "no-console": "off",
    "no-process-exit": "off",
    "unicorn/no-process-exit": "off",
  },
})
