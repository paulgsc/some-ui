import path from "path"
import { defineDomTest } from "@some-ui/vite-config/vitest"

export default defineDomTest({
  alias: { "@game-week": path.resolve(import.meta.dirname, "./src") },
  setupFiles: ["./vitest.setup.ts"],
})
