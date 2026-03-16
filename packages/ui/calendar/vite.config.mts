import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-calendar",
  libraryName: "SomeUICalender",
  alias: {
    "@calendar": resolve(__dirname, "src"),
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
