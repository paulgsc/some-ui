import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-portfolio-chart",
  libraryName: "SomeUIPortfolio",
  alias: {
    "@portfolio-chart": resolve(__dirname, "src"),
  },
})
