import { resolve } from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import dts from "vite-plugin-dts"

import pkg from "./package.json"

const externalDeps = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      exclude: [
        "**/*.test.*",
        "**/*.spec.*",
        "**/*.stories.*",
        "**/__tests__/**",
        "**/__mocks__/**",
        "**/stories/**",
      ],
    }),
  ],
  resolve: {
    alias: {
      "@utils": resolve(__dirname, "src"),
    },
  },
  build: {
    lib: {
      // Entry point of your library
      entry: resolve(__dirname, "src/index.ts"),
      name: "SomeUIUtils",
      // File name for the generated bundles
      fileName: "some-ui-utils",
    },
    rollupOptions: {
      // Externalize deps that shouldn't be bundled
      external: ["react", "react-dom", ...externalDeps],
      output: {
        // Global variables for UMD build
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
  },
})
