import { uiRecommended } from "@some-ui/eslint-kit"
import tseslint from "typescript-eslint"

export default tseslint.config(...uiRecommended, {
  files: ["vite.config.ts"],
  extends: [tseslint.configs.disableTypeChecked],
})
