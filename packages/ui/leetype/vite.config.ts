import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/leetype",
  libraryName: "SomeUILeetype",
  alias: {
    "@leetype": resolve(__dirname, "src"),
  },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
