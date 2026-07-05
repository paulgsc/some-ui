import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-nfl",
  libraryName: "SomeUINfl",
  alias: {
    "@nfl": resolve(__dirname, "src"),
  },
  contentPackage: true,
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
