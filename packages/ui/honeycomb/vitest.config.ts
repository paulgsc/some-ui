import path from "path"
import { defineDomTest } from "@some-ui/vite-config/vitest"

export default defineDomTest({
  alias: {
    // Mirror the "@honeycomb/*" -> "./src/*" path mapping from tsconfig.json
    // so tests can import modules that use the alias internally.
    "@honeycomb": path.resolve(import.meta.dirname, "./src"),
  },
  setupFiles: ["./vitest.setup.ts"],
  optimizeTestingLibrary: true,
})
