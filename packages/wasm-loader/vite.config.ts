import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-wasm-loader",
  libraryName: "SomeUIWasmLoader",
  alias: {
    "@wasm-loader": resolve(__dirname, "src"),
  },
  tsConfigPaths: { projects: [resolve(__dirname, "tsconfig.build.json")] },
})
