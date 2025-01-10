//@ts-check
import type { ConfigWithExtends } from "typescript-eslint"

export default <ConfigWithExtends>{
  files: [
    "**/tools/**/*.{ts,tsx,cts,mts}",
    "packages/repo-tools/**/*.{ts,tsx,cts,mts}",
  ],
  rules: {
    "no-console": "off",
  },
}
