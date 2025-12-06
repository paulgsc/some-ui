import { resolve } from "node:path"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: ["nixos.local"],
    port: 5000,
    strictPort: true,
  },
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    viteReact(),
    tsconfigPaths({
      projects: [
        "./tsconfig.json",
        "../../packages/some-content/tsconfig.json",
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@content": resolve(__dirname, "../../packages/some-content/src"),
    },
  },
  build: {
    // Enable rollup bundle analysis
    rollupOptions: {
      output: {
        // Manual chunk splitting for better analysis
        manualChunks: {
          // Separate your authored dependencies
          "authored-deps": ["some-ui-input"], // Add your package names here, e.g., ['@myorg/package1', '@myorg/package2']
          // Common vendor chunks
          "react-vendor": ["react", "react-dom"],
          "router-vendor": ["@tanstack/react-router"],
          "utils-vendor": ["lodash", "date-fns"], // Add your utility deps
        },
      },
      // Tree shaking options
      treeshake: {
        // Enable aggressive tree shaking
        moduleSideEffects: false,
        // Custom tree shaking for your authored packages
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
        // Enable pure annotation checking
        annotations: true,
      },
      // External dependencies (won't be bundled)
      external: (id) => {
        // Don't externalize your authored packages - we want to analyze them
        if (id.startsWith("some")) return false
        // You can add other conditions here
        return false
      },
    },
    // Generate source maps for better analysis
    sourcemap: true,
    // Minification settings that preserve tree shaking info
    minify: "terser",
    terserOptions: {
      compress: {
        // Keep function names for better analysis
        keep_fnames: true,
        // Drop console statements in production
        drop_console: true,
        // Remove dead code
        dead_code: true,
        // Remove unused variables
        unused: true,
      },
      mangle: {
        // Keep function names for analysis
        keep_fnames: true,
      },
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Generate detailed build report
    reportCompressedSize: true,
  },
  // Dependency optimization
  optimizeDeps: {
    // Include your authored dependencies for analysis
    include: [
      // Add your authored package names here
      // '@yourorg/package1',
      // '@yourorg/package2',
    ],
    // Exclude packages you want to analyze tree shaking for
    exclude: [],
  },
  // Define globals for tree shaking analysis
  define: {
    // This helps with dead code elimination
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
    // Add feature flags for your packages
    __FEATURE_A__: JSON.stringify(true),
    __FEATURE_B__: JSON.stringify(false),
  },
  // ESBuild options for tree shaking
  esbuild: {
    // Tree shaking of unused imports
    treeShaking: true,
    // Keep names for better analysis
    keepNames: true,
  },
})
