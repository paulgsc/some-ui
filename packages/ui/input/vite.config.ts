import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-input",
  libraryName: "SomeUIInput",
  alias: {
    "@input": resolve(import.meta.dirname, "src"),
  },
  dtsOptions: {
    exclude: ["**/obs-monitor/**"],
  },
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
