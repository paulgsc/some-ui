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

// The same trick for the same reason, one port over: file_host (paulgsc/server)
// serves plain HTTP on 3000 and terminates no TLS, so an https:// page cannot
// fetch it directly - mixed content, blocked before the request leaves the
// page, and no amount of ALLOWED_ORIGINS on the server changes that. This is
// the study origin's only route to sessions and push subscriptions, since a
// service worker requires a secure context in the first place.
//
// Kept in step by hand with the location block in apps/www/nginx.https.conf
// and with FILE_HOST_PROXY_PATH in src/lib/file-host-config - changing it means
// changing all three. FILE_HOST_PROXY_TARGET covers file_host running on
// another host or port.
const FILE_HOST_PROXY_PATH = "/api/file-host"
const fileHostProxyTarget =
  process.env.FILE_HOST_PROXY_TARGET || "http://127.0.0.1:3000"

// honeycomb's sfx (see scripts/link-content-assets.js) is curated,
// gitignored, and only ever present if a developer symlinked it in on purpose
// - never auto-run on dev startup (see that script's header for why). Without
// it, requests like /sfx/correct.mp3 fall through vite's SPA history fallback
// and come back as index.html, which the browser reports as an opaque
// "Content-Type text/html is not supported" media error. Surface the actual
// cause loudly instead of leaving that to guess.
//
// hangul and topiks are deliberately not warned about: their absence is
// expected and legible in the UI on its own (a bundled demo pool for the
// first, an empty catalogue for topiks), so a startup warning would fire on
// almost every checkout and mean nothing.
function warnMissingContentAssets(): Plugin {
  return {
    name: "warn-missing-content-assets",
    configureServer(): void {
      const missing = ["sfx"].filter(
        (name) => !fs.existsSync(resolve(__dirname, "public", name))
      )
      if (missing.length === 0) return
      // eslint-disable-next-line no-console
      console.warn(
        `\n[www] public/${missing.join(", public/")} not found - honeycomb sound` +
          ` won't load. The browser will show a confusing` +
          ` "Content-Type text/html" media error instead of a 404.\n` +
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
          // `docker compose up openai-edge-tts` publishes nothing on the
          // host - that container only `expose`s 5050 to the compose
          // network, and it is the `nginx` service beside it that maps
          // ${PORT:-5050} to your machine. Starting one without the other
          // leaves this proxy connecting to a closed port, and Vite's own
          // "http proxy error: ECONNREFUSED" says nothing about which
          // container is missing. Name it once, here.
          configure: (proxy): void => {
            proxy.on("error", (error: Error & { code?: string }): void => {
              if (error.code !== "ECONNREFUSED") return
              // eslint-disable-next-line no-console
              console.warn(
                `\n[www] nothing is listening on ${ttsProxyTarget} - speech will fail while everything else works.\n` +
                  `  Both TTS containers have to be up, not just the backend:\n` +
                  `    docker compose up -d openai-edge-tts nginx\n` +
                  `  (set TTS_PROXY_TARGET if your PORT is not 5050 or the backend is on another host.)\n`
              )
            })
          },
        },
        [FILE_HOST_PROXY_PATH]: {
          target: fileHostProxyTarget,
          changeOrigin: true,
          rewrite: (path): string =>
            path.replace(new RegExp(`^${FILE_HOST_PROXY_PATH}`), ""),
          // Name the backend, the same way the TTS proxy names its
          // container. Vite's bare "http proxy error: ECONNREFUSED" is the
          // exact message that gets read as a CORS problem and sends
          // someone to reconfigure a server that was already correct.
          configure: (proxy): void => {
            proxy.on("error", (error: Error & { code?: string }): void => {
              if (error.code !== "ECONNREFUSED") return
              // eslint-disable-next-line no-console
              console.warn(
                `\n[www] nothing is listening on ${fileHostProxyTarget} - file_host is down.\n` +
                  `  Sessions and study reminders will fail; everything else works.\n` +
                  `  Start it from paulgsc/server:\n` +
                  `    cargo run -p file_host\n` +
                  `  (set FILE_HOST_PROXY_TARGET if it runs on another host or port.)\n`
              )
            })
          },
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
      TanStackRouterVite({
        autoCodeSplitting: true,
        routeFileIgnorePattern: String.raw`\.test\.[jt]sx?$`,
      }),
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
        // No `output.manualChunks`. The hand-rolled version here matched with
        // `id.includes(pkg)` — a substring test against the full module path —
        // which under pnpm matches far more than the package named. pnpm
        // encodes peer deps in the virtual-store directory name
        // (`framer-motion@11.15.0_react-dom@19.0.0_react@19.0.0__react@19.0.0`),
        // so `includes("react")` swept up *every* package declaring react as a
        // peer: lucide-react, framer-motion/motion-dom, all of @tanstack,
        // cmdk, sonner, zustand. Those landed in one `react-vendor` chunk that
        // index.html then `modulepreload`ed, so the landing page eagerly
        // fetched ~190 KB gzip of which Lighthouse measured 56% unused —
        // undoing the route splitting `autoCodeSplitting: true` had just done.
        // Letting Rolldown chunk from the real import graph cut critical-path
        // JS from ~340 KB to ~161 KB gzip and moved FCP 3.3s -> 2.3s. Reach
        // for `advancedChunks` (Rolldown's grouping API) if this ever needs
        // manual grouping again — and match on package *boundaries*, not
        // substrings of the resolved path.
        output: {},
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
      minify: "terser",
      terserOptions: {
        compress: {
          // Drop console statements in production
          drop_console: true,
          // Remove dead code
          dead_code: true,
          // Remove unused variables
          unused: true,
        },
        // No `keep_fnames` (it was set on both `compress` and `mangle`).
        // It was there to keep readable names in the bundle analyzer, but it
        // applies to every production build, not just analysis runs: function
        // names survive mangling in shipped code, which is bytes users pay to
        // download on a page they will never profile. `sourcemap: true` below
        // already gives the analyzer real names without shipping them, and
        // `pnpm build:analyze` reads the sourcemaps. Set it in that script's
        // own build if the analyzer ever needs it, not in the default one.
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
    // No `esbuild` block. Vite 8 transforms with oxc, not esbuild, and
    // ignores this key outright — the build printed "Both esbuild and oxc
    // options were set. oxc options will be used and esbuild options will be
    // ignored" on every run. `treeShaking: true` was also already the default,
    // and `keepNames: true` pulled in the same direction as the `keep_fnames`
    // removed above, so nothing here was doing work worth keeping.
  })
)
