import fs from "node:fs"
import { resolve } from "node:path"
import { createStylePlugins } from "@some-ui/styles/styles-build/dev-config"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import type { Plugin, UserConfig } from "vite"
import { defineConfig } from "vite"

import styleContext from "./style.context"

const certPath = resolve(__dirname, "../../certs/nixos.local+3.pem")
const keyPath = resolve(__dirname, "../../certs/nixos.local+3-key.pem")
const hasLocalCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)

// The dev/preview counterpart of apps/www/nginx.tts-proxy.conf: the same
// same-origin /api/tts/ route, pointed at the port infra/compose/tts.yml
// publishes on the host instead of at the container over the compose
// network. Without it, `vite dev` with the certs above (i.e. over HTTPS)
// hits the mixed-content block that path exists to avoid, since
// src/lib/tts-config resolves an HTTPS page to this path.
//
// Kept in step by hand with that nginx snippet and with TTS_PROXY_PATH in
// src/lib/tts-config - importing the constant here would pull an
// `import.meta.env` reader into the config's Node context for one string.
// TTS_PROXY_TARGET covers a PORT other than 5050 in .env, or a backend
// running somewhere other than this machine.
const TTS_PROXY_PATH = "/api/tts"
const ttsProxyTarget = process.env.TTS_PROXY_TARGET || "http://127.0.0.1:5050"

// honeycomb's sfx / leetype's code samples (see scripts/link-content-assets.js)
// are curated, gitignored, and only ever present if a developer symlinked
// them in on purpose - never auto-run on dev startup (see that script's
// header for why). Without them, requests like /sfx/correct.mp3 fall through
// vite's SPA history fallback and come back as index.html, which the browser
// reports as an opaque "Content-Type text/html is not supported" media
// error. Surface the actual cause loudly instead of leaving that to guess.
//
// hangul, leetype and topiks are deliberately not warned about: their absence
// is expected and legible in the UI on its own (a bundled demo pool for the
// first two, an empty catalogue for topiks), so a startup warning would fire
// on almost every checkout and mean nothing.
function warnMissingContentAssets(): Plugin {
  return {
    name: "warn-missing-content-assets",
    configureServer(): void {
      const missing = ["sfx", "code-samples"].filter(
        (name) => !fs.existsSync(resolve(__dirname, "public", name))
      )
      if (missing.length === 0) return
      // eslint-disable-next-line no-console
      console.warn(
        `\n[www] public/${missing.join(", public/")} not found - honeycomb sound` +
          ` and/or leetype code samples won't load. The browser will show a` +
          ` confusing "Content-Type text/html" media error instead of a 404.\n` +
          `  If you have the real files under packages/some-content/public/, run:\n` +
          `    pnpm run content:link\n` +
          `  Otherwise this is expected on a fresh checkout - those assets are` +
          ` curated and gitignored.\n`
      )
    },
  }
}

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
      // `vite preview` inherits this (its own `preview.proxy` defaults to
      // `server.proxy`), so both dev servers speak.
      proxy: {
        [TTS_PROXY_PATH]: {
          target: ttsProxyTarget,
          changeOrigin: true,
          rewrite: (path): string =>
            path.replace(new RegExp(`^${TTS_PROXY_PATH}`), ""),
        },
      },
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
      // Single Tailwind pass over www's declared graph (style.context.ts):
      // utilities + the shared design layer are generated exactly once, from an
      // explicit @source set, instead of once per package. See #636.
      ...createStylePlugins(styleContext),
      TanStackRouterVite({ autoCodeSplitting: true }),
      viteReact(),
      ...(command === "serve" ? [warnMissingContentAssets()] : []),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
      tsconfigPaths: true,
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
              "authored-deps": ["@some-ui/leetype"], // Add your package names here, e.g., ['@myorg/package1', '@myorg/package2']
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
