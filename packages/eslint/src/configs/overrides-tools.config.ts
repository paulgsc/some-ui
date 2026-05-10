//@ts-check
import type { ConfigWithExtends } from "typescript-eslint"

const config: ConfigWithExtends = {
  files: ["**/tools/**/*.{ts,tsx,cts,mts}", "repo-tools/**/*.{ts,tsx,cts,mts}"],
  rules: {
    "no-console": "off",
    // Tools & scripts may legitimately call deprecated APIs or use any
    "@typescript-eslint/no-deprecated": "off",
    "@typescript-eslint/no-explicit-any": "warn",
  },
}

export default config
