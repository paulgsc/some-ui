import { resolve } from "path"
import preact from "@preact/preset-vite"
import { defineConfig } from "vite"
import dts from "vite-plugin-dts"

export default defineConfig({
  plugins: [
    preact(),
    dts({
      outDir: "dist",
      entryRoot: "src",
      exclude: ["**/*.stories.*", "**/*.test.*"],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "SomeCycle",
      formats: ["es", "cjs"], // modern + Node
      fileName: (format) => (format === "es" ? "index.mjs" : "index.cjs"),
    },
    rollupOptions: {},
    sourcemap: true,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // Keep console for debugging
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
    tsconfigPaths: true,
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    global: "globalThis",
  },
})
