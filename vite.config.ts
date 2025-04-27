import path from "path"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

export default defineConfig({
  plugins: [wasm(), topLevelAwait(), react()],
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
      "@portfolio-chart": path.resolve(
        __dirname,
        "./packages/ui/portfolio-chart/src"
      ),
      "@makjang": path.resolve(__dirname, "./packages/ui/makjang/src"),
      "@umag": path.resolve(__dirname, "./packages/ui/umag/src"),
      "@stepper": path.resolve(__dirname, "./packages/ui/stepper/src"),
      "@overlays": path.resolve(__dirname, "./packages/ui/overlays/src"),
      "@honeycomb": path.resolve(__dirname, "./packages/ui/honeycomb/src"),
      "@neon-sign": path.resolve(__dirname, "./packages/ui/neon-sign/src"),
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
