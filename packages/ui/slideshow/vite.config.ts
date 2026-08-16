import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/slideshow",
  libraryName: "SomeUISlideshow",
  alias: {
    "@slideshow": resolve(import.meta.dirname, "src"),
  },
  contentPackage: true,
  dtsOptions: {
    exclude: ["**/recap/**"],
  },
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
