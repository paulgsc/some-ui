import path, { resolve } from "path"
import { createRollupConfig } from "some-ui-rollup-config"

import packageJson from "./package.json"

const aliasPath = {
  aliasKey: "@slideshow",
  pathVal: resolve(__dirname, "src"),
}
const tsconfig = path.join(__dirname, "tsconfig.build.json")
const custExt = ["**/*.ts"]

export default createRollupConfig({
  tsconfig,
  packageJson,
  aliasPath: aliasPath,
  custExt,
})
