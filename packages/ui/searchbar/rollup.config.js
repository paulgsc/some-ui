import path from "path"
import { createRollupConfig } from "@some-ui/rollup-config"

import packageJson from "./package.json"

const CONFIG_TYPESCRIPT = {
  tsconfig: path.join(__dirname, "tsconfig.json"),
}

const external = ["nuqs", "react", "react-dom", "@radix-ui/react-select"]

export default createRollupConfig(packageJson, CONFIG_TYPESCRIPT, external)
