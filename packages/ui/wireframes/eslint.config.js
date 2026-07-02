import someUIEslint from "maishatu-eslint-kit"
import tseslint from "typescript-eslint"

export default tseslint.config(...someUIEslint, {
  files: ["vite.config.ts"],
  extends: [tseslint.configs.disableTypeChecked],
})
