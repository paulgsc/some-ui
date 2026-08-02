import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@speech": new URL("./src", import.meta.url).pathname,
    },
  },

  test: {
    // The adapters, the player and the React surface all touch DOM globals
    // (AudioContext, speechSynthesis, React roots) - jsdom supplies the
    // ones it has, and the fakes in `src/lib/testing` supply the rest.
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
  },
})
