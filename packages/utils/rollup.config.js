import path from "path"
import { createRollupConfig } from "@some-ui/rollup-config"

import packageJson from "./package.json"

const CONFIG_TYPESCRIPT = {
  tsconfig: path.join(__dirname, "tsconfig.json"),
}
const external = ["react", "usehooks-ts"]

export default createRollupConfig(packageJson, CONFIG_TYPESCRIPT, external)
