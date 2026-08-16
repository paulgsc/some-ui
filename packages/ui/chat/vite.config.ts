import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/chat",
  libraryName: "SomeUIChat",
  alias: {
    "@chat": resolve(import.meta.dirname, "src"),
  },
  contentPackage: true,
  contentPackageDataExclude: ["**/data/chat-messages.ts", "**/data/index.ts"],
  tsConfigPaths: { projects: [resolve(import.meta.dirname, "tsconfig.build.json")] },
})
