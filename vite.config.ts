import path, { resolve } from "path"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"
import dts from "vite-plugin-dts"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), react(), dts({ include: ["src"] })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pivot-search": path.resolve(__dirname, "./packages/pivot-search/src"),
      "@shared": path.resolve(__dirname, "./packages/ui/shared/src"),
      "@attributions": path.resolve(
        __dirname,
        "./packages/ui/attributions/src"
      ),
      "@chat": path.resolve(__dirname, "./packages/ui/chat/src"),
      "@input": path.resolve(__dirname, "./packages/ui/input/src"),
      "@searchbar": path.resolve(__dirname, "./packages/ui/searchbar/src"),
      "@nfl": path.resolve(__dirname, "./packages/ui/nfl/src"),
      "@charts": path.resolve(__dirname, "./packages/charts/d3/src"),
      "@slideshow": path.resolve(__dirname, "./packages/ui/slideshow/src"),
      "@emoji": path.resolve(__dirname, "./packages/ui/emoji-animations/src"),
      "@wireframes": path.resolve(__dirname, "./packages/ui/wireframes/src"),
      "@portfolio": path.resolve(
        __dirname,
        "./packages/ui/portfolio-chart/src"
      ),
      "@makjang": path.resolve(__dirname, "./packages/ui/makjang/src"),
      "@umag": path.resolve(__dirname, "./packages/ui/umag/src"),
      "@stepper": path.resolve(__dirname, "./packages/ui/stepper/src"),
      "@overlays": path.resolve(__dirname, "./packages/ui/overlays/src"),
      "@honeycomb": path.resolve(__dirname, "./packages/ui/honeycomb/src"),
      "@calendar": path.resolve(__dirname, "./packages/ui/calendar/src"),
      "@resume": path.resolve(__dirname, "./packages/ui/resume/src"),
      "@neon-sign": path.resolve(__dirname, "./packages/ui/neon-sign/src"),
      "@content": path.resolve(__dirname, "./packages/some-content/src"),
      "@some-ui/content": path.resolve(
        __dirname,
        "./packages/some-content/src"
      ),

      // --------------- Extensions ---------------
      "@drama": path.resolve(__dirname, "./extensions/some-drama/src"),
      "@tab": path.resolve(__dirname, "./extensions/tab-tracker/src"),
      "@censor": path.resolve(__dirname, "./extensions/some-filter/src"),
      "@mujik": path.resolve(__dirname, "./extensions/some-mujik/src"),
      "@filter": path.resolve(__dirname, "./extensions/some-filter/src"),
      "@conveyor": path.resolve(__dirname, "./extensions/some-conveyor/src"),
      "@suspender": path.resolve(
        __dirname,
        "./extensions/suspender-ledger/src"
      ),

      // Add more aliases for other packages as needed
    },
  },
  // This allows Vite to resolve packages within the monorepo
  server: {
    fs: {
      allow: [".."],
    },
  },
})
