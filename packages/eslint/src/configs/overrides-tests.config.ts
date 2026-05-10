//@ts-check
import type { ConfigWithExtends } from "typescript-eslint"

const config: ConfigWithExtends = {
  files: [
    "**/tests/**/*.{ts,tsx,cts,mts}",
    "packages/integration-tests/**/*.{ts,tsx,cts,mts}",
    "**/*.test.{ts,tsx}",
    "**/*.spec.{ts,tsx}",
  ],
  rules: {
    "no-console": "off",
    // Allow deprecated APIs in tests — they often test deprecated paths
    "@typescript-eslint/no-deprecated": "off",
    // Floating promises are common in test assertions (fire-and-forget expect)
    "@typescript-eslint/no-floating-promises": "off",
  },
}
export default config
