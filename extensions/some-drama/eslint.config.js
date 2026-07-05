import { defineConfig } from "eslint/config"
import {
  extensionCharterPlugin,
  extensionsRecommended,
} from "maishatu-eslint-kit"

export default defineConfig(...extensionsRecommended, {
  files: ["src/logic/**/*.{js,mjs,ts,tsx}"],
  plugins: {
    "extension-charter": extensionCharterPlugin,
  },
  rules: {
    "extension-charter/no-logic-layer-side-effects": "error",
  },
})
