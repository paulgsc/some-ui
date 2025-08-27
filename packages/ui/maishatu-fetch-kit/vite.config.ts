import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "maishatu-fetch-kit",
  libraryName: "SomeFetchKit",
  alias: {
    "@fkit": resolve(__dirname, "src"),
  },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
