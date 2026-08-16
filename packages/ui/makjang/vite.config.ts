import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-makjang",
  libraryName: "SomeUIMakjang",
  alias: {
    "@makjang": resolve(import.meta.dirname, "src"),
  },
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
