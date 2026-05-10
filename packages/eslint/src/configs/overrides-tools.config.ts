//@ts-check
import { defineConfig } from "eslint/config"

export default defineConfig({
  files: ["**/tools/**/*.{ts,tsx,cts,mts}", "repo-tools/**/*.{ts,tsx,cts,mts}"],
  rules: {
    "no-console": "off",
    // Tools & scripts may legitimately call deprecated APIs or use any
    "@typescript-eslint/no-deprecated": "off",
    "@typescript-eslint/no-explicit-any": "warn",
  },
})
