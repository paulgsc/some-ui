import path, { resolve } from "path"
import { createRollupConfig } from "some-ui-rollup-config"

import packageJson from "./package.json"

const aliasPath = {
  aliasKey: "@wireframes",
  pathVal: resolve(__dirname, "src"),
}
const tsconfig = path.join(__dirname, "tsconfig.build.json")

export default createRollupConfig({
  tsconfig,
  packageJson,
  aliasPath: aliasPath,
})
