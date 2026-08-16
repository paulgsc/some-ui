import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/activity-catalog",
  libraryName: "SomeActivityCatalog",
  alias: {
    "@activity-catalog": resolve(import.meta.dirname, "src"),
  },
  tsConfigPaths: { projects: [resolve(import.meta.dirname, "tsconfig.build.json")] },
})
