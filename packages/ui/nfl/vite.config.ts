import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-nfl",
  libraryName: "SomeUINfl",
  alias: {
    "@nfl": resolve(import.meta.dirname, "src"),
  },
  contentPackage: true,
  tsConfigPaths: { projects: [resolve(import.meta.dirname, "tsconfig.build.json")] },
})
