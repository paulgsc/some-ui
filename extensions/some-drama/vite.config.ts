import { resolve } from "path"
import { defineConfig } from "vite"

// Production output is built by scripts/build.mjs, which runs content.ts,
// background.ts, and popup.html as independent single-entry builds so
// classic-context entries (content/background) can't end up importing a
// shared Rollup chunk. This config is only used by `pnpm dev`.
export default defineConfig({
  resolve: {
    alias: {
      "@drama": resolve(__dirname, "src"),
    },
  },
})
