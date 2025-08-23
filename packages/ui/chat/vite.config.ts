import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-chat",
  libraryName: "SomeUIChat",
  alias: {
    "@chat": resolve(__dirname, "src"),
  },
  dtsOptions: {
    exclude: ["**/data/**", "../../../assets/**/*"],
  },
})
