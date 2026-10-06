import path from "path"
import { defineDomTest } from "@some-ui/vite-config/vitest"

export default defineDomTest({
  alias: {
    // Mirror the "@leetype/*" -> "./src/*" path mapping from tsconfig.json
    // so tests can import modules that use the alias internally.
    "@leetype": path.resolve(import.meta.dirname, "./src"),
    // And "@leetype-corpus/*" -> "./corpus/*" (the bundled recorded runs).
    "@leetype-corpus": path.resolve(import.meta.dirname, "./corpus"),
    // The wasm package is a workspace crate whose dist/ only exists after
    // a wasm-pack build. Tests never want the real binary anyway (they
    // `vi.mock` it), so this points the specifier at the hand-written
    // declaration stub purely so resolution succeeds without a build.
    "@some-ui/leetype-wasm": path.resolve(
      import.meta.dirname,
      "./src/types/wasm/leetype-wasm.d.ts"
    ),
  },
  // Repairs Web Storage and stubs scrollIntoView before the shared cleanup.
  setupFiles: ["./vitest.setup.ts"],
  passWithNoTests: true,
  optimizeTestingLibrary: true,
})
