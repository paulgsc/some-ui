import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/interview",
  libraryName: "SomeUIInterview",
  alias: {
    "@interview": resolve(import.meta.dirname, "src"),
  },
  tsConfigPaths: { projects: [resolve(import.meta.dirname, "tsconfig.build.json")] },
})
