import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-mdx",
  libraryName: "SomeUIMdx",
  alias: {
    "@mdx": resolve(__dirname, "src"),
  },
})
