import path from "path"
import { createRollupConfig } from "@some-ui/rollup-config"

import packageJson from "./package.json"

const CONFIG_TYPESCRIPT = {
  tsconfig: path.join(__dirname, "tsconfig.build.json"),
}

const external = [
  "nuqs",
  "react",
  "react-dom",
  "@radix-ui/react-select",
  "lodash",
  "some-ui-utils",
  "some-ui-shared",
  "some-types-utils",
]

export default createRollupConfig(packageJson, CONFIG_TYPESCRIPT, external)
