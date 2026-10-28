import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/game-scenarios",
  libraryName: "SomeGameScenarios",
  alias: {
    "@game-scenarios": resolve(import.meta.dirname, "src"),
  },
})
