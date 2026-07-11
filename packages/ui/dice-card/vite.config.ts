import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/dice-card",
  libraryName: "SomeUIDiceCard",
  alias: {
    "@dice-card": resolve(__dirname, "src"),
  },
  dtsOptions: { exclude: ["**/demo/**"] },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
