import path from "path"
import { createRollupConfig } from "@some-ui/rollup-config"

import packageJson from "./package.json"

const CONFIG_TYPESCRIPT = {
  tsconfig: path.join(__dirname, "tsconfig.build.json"),
}

const external = [
  "@radix-ui/react-accordion",
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-collapsible",
  "@radix-ui/react-dialog",
  "@radix-ui/react-slot",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-separator",
  "@radix-ui/react-select",
  "@radix-ui/react-tabs",
  "@radix-ui/react-tooltip",
  "embla-carousel-react",
  "lucide-react",
  "react-resizable-panels",
  "class-variance-authority",
  "tailwind-merge",
  "clsx",
  "react",
  "react-dom",
  "recharts",
  "some-ui-utils",
]

export default createRollupConfig(packageJson, CONFIG_TYPESCRIPT, external)
