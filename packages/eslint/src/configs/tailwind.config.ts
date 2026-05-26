import * as tailwindPlugin from "eslint-plugin-tailwindcss"
import type { ConfigWithExtends } from "typescript-eslint"

const config: Array<ConfigWithExtends> = [
  {
    plugins: {
      tailwindcss: tailwindPlugin,
    },
    settings: {
      tailwindcss: {
        callees: ["cn", "cva"],
      },
    },
    rules: {
      // removed rules that no longer exist in beta
      // "tailwindcss/classnames-order": "warn",
      // "tailwindcss/enforces-shorthand": "warn",
      // "tailwindcss/no-custom-classname": "warn",
      // "tailwindcss/no-contradicting-classname": "error",
      // "tailwindcss/no-unnecessary-arbitrary-value": "error",
    },
  },
]

export default config
