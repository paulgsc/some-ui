import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-honeycomb",
  libraryName: "SomeUIHoneycomb",
  alias: {
    "@honeycomb": resolve(import.meta.dirname, "src"),
  },
  dtsOptions: {
    exclude: ["**/hexagon-grid-demo/**", "vitest.config.ts", "vitest.setup.ts"],
  },
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
