import path from "path"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      "@mujik": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/background/background.ts"),
      name: "BackgroundScript",
      formats: ["iife"],
      fileName: () => "background.js",
    },
    rollupOptions: {
      output: {
        format: "iife",
      },
      treeshake: {
        preset: "smallest",
        moduleSideEffects: false,
      },
    },
  },
  define: {
    global: "globalThis",
  },
})
