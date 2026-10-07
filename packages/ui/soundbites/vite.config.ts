import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/soundbites",
  libraryName: "SomeUISoundbites",
  entries: { contract: "src/contract.ts" },
  alias: {
    "@soundbites": resolve(import.meta.dirname, "src"),
  },
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
