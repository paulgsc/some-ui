import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/assessment",
  libraryName: "SomeUIAssessment",
  alias: {
    "@assessment": resolve(import.meta.dirname, "src"),
  },
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
