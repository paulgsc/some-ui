import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    // use-websocket.ts is a React hook (useSyncExternalStore) - needs a DOM.
    environment: "jsdom",

    // Allows 'describe', 'it', 'expect' without importing them in every file
    globals: true,

    include: ["**/*.test.{ts,tsx}"],
  },
})
