import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-honeycomb",
  libraryName: "SomeUIHoneycomb",
  alias: {
    "@honeycomb": resolve(__dirname, "src"),
  },
  dtsOptions: {
    exclude: [
      "**/*.stories.tsx",
      "**/*.stories.ts",
      "**/hexagon-grid-demo/**",
      "vitest.config.ts",
      "vitest.setup.ts",
    ],
  },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
