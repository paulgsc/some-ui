import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "wireframes",
  libraryName: "SomeUIWireframes",
  alias: {
    "@wireframes": resolve(import.meta.dirname, "src"),
  },
  dtsOptions: {
    exclude: ["**/recap/**"],
  },
  contentPackage: true,
  tsConfigPaths: { projects: [resolve(import.meta.dirname, "tsconfig.build.json")] },
})
