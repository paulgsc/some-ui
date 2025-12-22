import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "wireframes",
  libraryName: "SomeUIWireframes",
  alias: {
    "@wireframes": resolve(__dirname, "src"),
  },
  dtsOptions: {
    exclude: [
      "**/data/**",
      "**/demo/**",
      "../../../assets/**/*",
      "../../some-content/src/**/*",
    ],
  },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
