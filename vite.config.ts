import path from "path"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"
import dts from "vite-plugin-dts"
import topLevelAwait from "vite-plugin-top-level-await"
import wasm from "vite-plugin-wasm"

export default defineConfig({
  // @ts-expect-error vite-plugin-wasm/vite-plugin-top-level-await resolve
  // against a different hoisted vite version than this repo's own vite dep
  plugins: [wasm(), topLevelAwait(), react(), dts({ include: ["src"] })],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@pivot-search": path.resolve(import.meta.dirname, "./packages/pivot-search/src"),
      "@shared": path.resolve(import.meta.dirname, "./packages/ui/shared/src"),
      "@attributions": path.resolve(
        import.meta.dirname,
        "./packages/ui/attributions/src"
      ),
      "@chat": path.resolve(import.meta.dirname, "./packages/ui/chat/src"),
      "@input": path.resolve(import.meta.dirname, "./packages/ui/input/src"),
      "@searchbar": path.resolve(import.meta.dirname, "./packages/ui/searchbar/src"),
      "@nfl": path.resolve(import.meta.dirname, "./packages/ui/nfl/src"),
      "@charts": path.resolve(import.meta.dirname, "./packages/charts/d3/src"),
      "@slideshow": path.resolve(import.meta.dirname, "./packages/ui/slideshow/src"),
      "@dice-card": path.resolve(import.meta.dirname, "./packages/ui/dice-card/src"),
      "@leetype": path.resolve(import.meta.dirname, "./packages/ui/leetype/src"),
      "@topik": path.resolve(import.meta.dirname, "./packages/ui/topik/src"),
      "@interview": path.resolve(import.meta.dirname, "./packages/ui/interview/src"),
      "@emoji": path.resolve(import.meta.dirname, "./packages/ui/emoji-animations/src"),
      "@wireframes": path.resolve(import.meta.dirname, "./packages/ui/wireframes/src"),
      "@portfolio": path.resolve(
        import.meta.dirname,
        "./packages/ui/portfolio-chart/src"
      ),
      "@makjang": path.resolve(import.meta.dirname, "./packages/ui/makjang/src"),
      "@umag": path.resolve(import.meta.dirname, "./packages/ui/umag/src"),
      "@stepper": path.resolve(import.meta.dirname, "./packages/ui/stepper/src"),
      "@honeycomb": path.resolve(import.meta.dirname, "./packages/ui/honeycomb/src"),
      "@calendar": path.resolve(import.meta.dirname, "./packages/ui/calendar/src"),
      "@assessment": path.resolve(import.meta.dirname, "./packages/ui/assessment/src"),
      "@neon-sign": path.resolve(import.meta.dirname, "./packages/ui/neon-sign/src"),
      "@content": path.resolve(import.meta.dirname, "./packages/some-content/src"),
      "@some-ui/content": path.resolve(
        import.meta.dirname,
        "./packages/some-content/src"
      ),

      "@ws": path.resolve(import.meta.dirname, "./packages/ws/src"),

      // --------------- Extensions ---------------
      "@drama": path.resolve(import.meta.dirname, "./extensions/some-drama/src"),
      "@censor": path.resolve(import.meta.dirname, "./extensions/some-filter/src"),
      "@mujik": path.resolve(import.meta.dirname, "./extensions/some-mujik/src"),
      "@filter": path.resolve(import.meta.dirname, "./extensions/some-filter/src"),
      "@conveyor": path.resolve(import.meta.dirname, "./extensions/some-conveyor/src"),
      "@suspender": path.resolve(
        import.meta.dirname,
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
