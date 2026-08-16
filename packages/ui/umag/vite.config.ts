import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "umag",
  libraryName: "SomeUIUmag",
  alias: {
    "@umag": resolve(import.meta.dirname, "src"),
  },
  dtsOptions: {
    exclude: ["**/demo/**"],
  },
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
