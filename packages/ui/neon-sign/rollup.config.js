import path from "path"
import { createRollupConfig } from "@some-ui/rollup-config"

import packageJson from "./package.json"

const CONFIG_TYPESCRIPT = {
  tsconfig: path.join(__dirname, "tsconfig.build.json"),
}

const external = ["some-ui-utils"]

export default createRollupConfig(packageJson, CONFIG_TYPESCRIPT, external)
