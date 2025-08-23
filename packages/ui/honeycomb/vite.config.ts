import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-honeycomb",
  libraryName: "SomeUIHoneycomb",
  alias: {
    "@honeycomb": resolve(__dirname, "src"),
  },
  dtsOptions: {
    exclude: ["**/hexagon-grid-demo/**"],
  },
})
