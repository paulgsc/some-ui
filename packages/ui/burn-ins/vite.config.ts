import { resolve } from "path"
import { createViteConfig } from "@some-ui/vite-config"

export default createViteConfig({
  packageName: "some-ui-burn-ins",
  libraryName: "SomeUIBurnIns",
  entries: { contract: "src/contract.ts" },
  alias: {
    "@burn-ins": resolve(import.meta.dirname, "src"),
  },
})
