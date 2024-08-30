import path from "path"
import { createRollupConfig } from "@some-ui/rollup-config"

import packageJson from "./package.json"

const CONFIG_TYPESCRIPT = {
  tsconfig: path.join(__dirname, "tsconfig.json"),
}

const external = [
  "lucide-react",
  "@radix-ui/react-dropdown-menu",
  "next",
  "next-contentlayer2",
  "next-contentlayer2/hooks",
  "some-ui-shared",
  "some-ui-utils",
]

export default createRollupConfig(packageJson, CONFIG_TYPESCRIPT, external)
