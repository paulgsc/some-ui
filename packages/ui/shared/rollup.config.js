import path from "path"
import { createRollupConfig } from "@some-ui/rollup-config"

import packageJson from "./package.json"

const CONFIG_TYPESCRIPT = {
  tsconfig: path.join(__dirname, "tsconfig.json"),
}

const external = [
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-slot",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-select",
  "lucide-react",
  "react-resizable-panels",
  "class-variance-authority",
  "tailwind-merge",
  "clsx",
  "react",
  "react-dom",
]

export default createRollupConfig(packageJson, CONFIG_TYPESCRIPT, external)
