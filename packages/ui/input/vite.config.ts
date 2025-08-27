import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-input",
  libraryName: "SomeUIInput",
  alias: {
    "@input": resolve(__dirname, "src"),
  },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
