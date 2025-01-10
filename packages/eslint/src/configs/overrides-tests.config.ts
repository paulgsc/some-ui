//@ts-check
import type { ConfigWithExtends } from "typescript-eslint"

export default <ConfigWithExtends>{
  files: [
    "**/tests/**/*.{ts,tsx,cts,mts}",
    "packages/integration-tests/**/*.{ts,tsx,cts,mts}",
  ],
  rules: {
    "no-console": "off",
  },
}
