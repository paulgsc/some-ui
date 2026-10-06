import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "@some-ui/react-hooks",
  libraryName: "SomeReactHooks",
  alias: {
    "@react-hooks": resolve(import.meta.dirname, "src"),
  },
})
