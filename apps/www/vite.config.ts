import fs from "node:fs"
import { resolve } from "node:path"
import { createStylePlugins } from "@some-ui/styles/styles-build/dev-config"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import type { Plugin, UserConfig } from "vite"
import { defineConfig } from "vite"

import styleContext from "./style.context.ts"

const certPath = resolve(import.meta.dirname, "../../certs/nixos.local+3.pem")
const keyPath = resolve(
  import.meta.dirname,
  "../../certs/nixos.local+3-key.pem"
)
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
// Set by scripts/analyze-bundle.js: the analyze build keeps sourcemaps and the
// gzip report that the default build skips.
const analyze = process.env.WWW_ANALYZE === "1"

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
        (name) => !fs.existsSync(resolve(import.meta.dirname, "public", name))
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
        // src/routes/ is the routing tree: every filename in it is a route
        // path. Tests live in a `__tests__/` directory per #1471, and this
        // ignores that directory - nothing else.
        //
        // It deliberately does NOT ignore `*.test.tsx` by name any more. That
        // is what it used to do, and it made the routes tree a comfortable
        // place to drop tests: `_dashboard.shell.test.tsx` parses as the route
        // /_dashboard/shell, and the pattern quietly swallowed it. Narrowing
        // this to the directory means a test file dropped back beside a route
        // shows up as a phantom route instead of disappearing - loud, which is
        // the point.
        routeFileIgnorePattern: String.raw`(^|/)__tests__(/|$)`,
      }),
      viteReact(),
      ...(command === "serve" ? [warnMissingContentAssets()] : []),
    ],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
      tsconfigPaths: true,
    },
    build: {
      // Enable rollup bundle analysis
      rolldownOptions: {
        // Two HTML entries, one JS app: both boot the same
        // src/main.tsx/router, so the /resume shell isn't a second copy of
        // the app - it's the same SPA under a route-specific document (see
        // resume/index.html's header comment) that GitHub Pages can serve
        // as a real 200 at /resume/ instead of the generic app-shell
        // 404.html fallback every other unmatched path relies on.
        input: {
          main: resolve(import.meta.dirname, "index.html"),
          resume: resolve(import.meta.dirname, "resume/index.html"),
        },
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
        output: {
          // Production builds strip console calls (terser's `drop_console`,
          // carried over to oxc — see `minify` below).
          minify: { compress: { dropConsole: true }, mangle: true },
        },
        // Tree shaking options
        treeshake: {
          // Every module is treated as side-effect free, so an import that
          // binds nothing (`import "@some-ui/x/register"`) is dropped from the
          // bundle along with whatever that module does at load time. Keep
          // that in mind before adding one: this line overrides the
          // `sideEffects` field of every workspace package's manifest for JS.
          //
          // It does NOT drop stylesheets (#1458, measured on Vite 8 /
          // Rolldown): with `import "@some-ui/auth/style.css"` added to a
          // route and a marker rule appended to that file, the marker shipped
          // in www's CSS both with this setting and without it — Vite's CSS
          // pipeline keeps CSS modules regardless. So the 22 packages/ui
          // manifests that declare `sideEffects: ["*.css"]` are not being
          // overridden here; www imports no package CSS today anyway
          // (src/index.css runs one Tailwind pass over style.context.ts).
          moduleSideEffects: false,
          // Custom tree shaking for your authored packages
          propertyReadSideEffects: false,
          // Enable pure annotation checking
          annotations: true,
        },
      },
      // Sourcemaps and the gzip column are for `pnpm build:analyze`, which
      // sets WWW_ANALYZE before building (scripts/analyze-bundle.js). The
      // default build — CI, the Pages deploy, the Docker image — pays for
      // neither: the maps were ~4x the code they describe, ~120 of them, and
      // nothing that ships reads them; reportCompressedSize gzips every chunk
      // only to print a column (#1449).
      sourcemap: analyze,
      reportCompressedSize: analyze,
      // Vite 8's default minifier (oxc), not terser: terser's renderChunk was
      // most of the plugin time in every build (#1449). `drop_console` moves
      // with it as oxc's `dropConsole` — set through `rolldownOptions.output`
      // above, which Vite spreads over its own `minify: true`.
      minify: "oxc",
      // Chunk size warnings
      chunkSizeWarningLimit: 1000,
    },
    // No `esbuild` block. Vite 8 transforms with oxc, not esbuild, and
    // ignores this key outright — the build printed "Both esbuild and oxc
    // options were set. oxc options will be used and esbuild options will be
    // ignored" on every run. `treeShaking: true` was also already the default,
    // and `keepNames: true` kept function names through mangling in every
    // shipped build — bytes users download for the analyzer's sake, when the
    // analyze build's sourcemaps already give it real names — so nothing here
    // was doing work worth keeping.
  })
)
