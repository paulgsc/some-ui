import fs from "node:fs"
import { resolve } from "node:path"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig, type UserConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

const certPath = resolve(__dirname, "../../certs/nixos.local+3.pem")
const keyPath = resolve(__dirname, "../../certs/nixos.local+3-key.pem")
const hasLocalCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)

// https://vitejs.dev/config/
export default defineConfig(
  ({ command }): UserConfig => ({
    // GitHub Pages serves this app under /<repo>/ instead of domain root;
    // Docker/nginx and local dev serve it at "/". Unset -> "/" for both.
    base: process.env.VITE_BASE_PATH || "/",
    server: {
      host: "0.0.0.0",
      allowedHosts: ["nixos.local"],
      port: 5173,
      strictPort: true,
      // Local mkcert certs are machine-local (gitignored) and only relevant to
      // `vite dev`/`vite preview` - `vite build` never starts a server, and
      // CI/Docker builds don't have these certs, so only wire this up when
      // both apply.
      ...(command === "serve" && hasLocalCerts
        ? {
            https: {
              cert: fs.readFileSync(certPath),
              key: fs.readFileSync(keyPath),
            },
          }
        : {}),
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
          // Manual chunk splitting for better analysis.
          // Vite 8's bundler (Rolldown) only supports the function form of
          // manualChunks, not the plain object map Rollup accepted.
          manualChunks: (id): string | undefined => {
            const chunks: Record<string, Array<string>> = {
              // Separate your authored dependencies
              "authored-deps": ["some-ui-input"], // Add your package names here, e.g., ['@myorg/package1', '@myorg/package2']
              // Common vendor chunks
              "react-vendor": ["react", "react-dom"],
              "router-vendor": ["@tanstack/react-router"],
              "utils-vendor": ["lodash", "date-fns"], // Add your utility deps
            }
            for (const [chunkName, packageNames] of Object.entries(chunks)) {
              if (packageNames.some((pkg) => id.includes(pkg))) return chunkName
            }
            return undefined
          },
        },
        // Tree shaking options
        treeshake: {
          // Enable aggressive tree shaking
          moduleSideEffects: false,
          // Custom tree shaking for your authored packages
          propertyReadSideEffects: false,
          // Enable pure annotation checking
          annotations: true,
        },
        // External dependencies (won't be bundled)
        external: (id): boolean => {
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
)
