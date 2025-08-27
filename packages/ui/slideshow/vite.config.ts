import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-slideshow",
  libraryName: "SomeUISlideshow",
  alias: {
    "@slideshow": resolve(__dirname, "src"),
  },
  dtsOptions: {
    exclude: ["**/data/**"],
  },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
