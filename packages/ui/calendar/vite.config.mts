import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-calendar",
  libraryName: "SomeUICalender",
  alias: {
    "@calendar": resolve(import.meta.dirname, "src"),
  },
  contentPackage: true,
  tsConfigPaths: {
    projects: [resolve(import.meta.dirname, "tsconfig.build.json")],
  },
})
