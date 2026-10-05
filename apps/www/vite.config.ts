import fs from "node:fs"
import { resolve } from "node:path"
import { createStylePlugins } from "@some-ui/styles/styles-build/dev-config"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import type { HtmlTagDescriptor, Plugin, UserConfig } from "vite"
import { defineConfig, loadEnv } from "vite"

import { buildAudiencePlugin, MOBILE_PROFILE } from "./build.profiles.ts"
import {
  describeTarget,
  fileHostDevPlugin,
  isBlockedProxyPath,
  resolveFileHostTarget,
} from "./file-host.dev.ts"
import styleContext from "./style.context.ts"

const certPath = resolve(import.meta.dirname, "../../certs/nixos.local+3.pem")
const keyPath = resolve(
  import.meta.dirname,
  "../../certs/nixos.local+3-key.pem"
)
const hasLocalCerts = fs.existsSync(certPath) && fs.existsSync(keyPath)

// `SOME_UI_DEV_HTTP=1` serves plain HTTP even where the certs exist, for the
// Android dev loop (apps/mobile `pnpm dev:web`): the WebView loads
// `http://localhost` over `adb reverse` and shows a blank screen on an
// untrusted certificate. `localhost` is still a secure context, which the
// device backend's `crypto.subtle` needs.
const devHttp = process.env.SOME_UI_DEV_HTTP === "1"

// The dev/preview counterpart of nginx.tts-proxy.conf: same-origin /api/tts/,
// pointed at the port infra/compose/tts.yml publishes, so an HTTPS dev page
// avoids the mixed-content block. Kept in step by hand with that snippet and
// TTS_PROXY_PATH in src/lib/tts-config (importing it would pull an
// `import.meta.env` reader into Node). TTS_PROXY_TARGET overrides the target.
const TTS_PROXY_PATH = "/api/tts"
// Set by scripts/analyze-bundle.js: the analyze build keeps sourcemaps and the
// gzip report that the default build skips.
const analyze = process.env.WWW_ANALYZE === "1"

const ttsProxyTarget = process.env.TTS_PROXY_TARGET || "http://127.0.0.1:5050"

// The same for file_host (paulgsc/server), which serves plain HTTP on 3000:
// an https:// page cannot fetch it directly (mixed content), and a service
// worker needs a secure context. Kept in step by hand with
// nginx.https.conf's location block and FILE_HOST_PROXY_PATH in
// src/lib/file-host-config. Where it points is file-host.dev.ts's call.
const FILE_HOST_PROXY_PATH = "/api/file-host"
const fileHost = resolveFileHostTarget()
const fileHostProxyTarget = fileHost.target

// honeycomb's sfx (scripts/link-content-assets.js) is curated, gitignored and
// symlinked in by hand. Without it, /sfx/*.mp3 falls through to index.html and
// the browser reports an opaque "Content-Type text/html" media error, so name
// the cause. hangul is not warned about: its absence is expected and visible.
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

// The Android app carries sessions only (src/lib/app-surface), so its build
// leaves out /resume: the document entry below and the PDFs
// scripts/sync-resume.mjs copies into public/. Vite copies public/ wholesale
// before the bundle is written, so they are removed after the build.
const isMobileBuild = process.env.SOME_UI_PROFILE === MOBILE_PROFILE

function omitResumePdfs(): Plugin {
  let outDir = ""
  return {
    name: "omit-resume-pdfs",
    apply: "build",
    configResolved(config): void {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle(): void {
      for (const name of fs.readdirSync(outDir)) {
        if (/^resume.*\.pdf$/.test(name)) fs.rmSync(resolve(outDir, name))
      }
    },
  }
}

// The Pages build has no backend by design (`VITE_STATIC_DATA`,
// `lib/data-mode`) and a static host cannot set headers, so a <meta> policy
// with `connect-src 'self'` makes any request to another origin fail loudly.
// `connect-src` only, and Pages only: the lan and Docker builds reach
// `file_host`, a chosen speech provider and a music-overlay socket, which
// tests/local-mode/no-egress.spec.ts checks instead.
//
// LA5 (docs/learner-data-authority.md): this tag is the invariant; widening the
// policy, dropping the plugin or moving the tag out of `head-prepend` breaks it.
//
// Prepended, because a meta policy only governs what loads after it.
const PAGES_CONNECT_POLICY = "connect-src 'self'"

function pagesConnectPolicy(): Plugin {
  return {
    name: "pages-connect-policy",
    apply: "build",
    transformIndexHtml(): Array<HtmlTagDescriptor> {
      if (process.env.SOME_UI_PROFILE !== "pages") return []
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: PAGES_CONNECT_POLICY,
          },
          injectTo: "head-prepend",
        },
      ]
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(
  ({ command, mode }): UserConfig => ({
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
          // `openai-edge-tts` only `expose`s 5050 to the compose network;
          // the `nginx` service publishes it. Vite's bare ECONNREFUSED does
          // not say which container is missing, so name it.
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
          // `false` answers 404 (and refuses a WebSocket upgrade the same
          // way). See `isBlockedProxyPath`.
          bypass: (req): false | undefined =>
            isBlockedProxyPath(req.url) ? false : undefined,
          rewrite: (path): string =>
            path.replace(new RegExp(`^${FILE_HOST_PROXY_PATH}`), ""),
          // Vite's bare ECONNREFUSED gets read as a CORS problem; name the
          // backend instead.
          configure: (proxy): void => {
            proxy.on("error", (error: Error & { code?: string }): void => {
              if (error.code !== "ECONNREFUSED") return
              // eslint-disable-next-line no-console
              console.warn(
                `\n[www] nothing is listening on ${describeTarget(fileHost)} - file_host is down.\n` +
                  `  Sessions and study reminders will fail; everything else works.\n` +
                  `  Start it from paulgsc/server (it finds a free port beside the container):\n` +
                  `    make dev\n` +
                  `  (set FILE_HOST_PROXY_TARGET if it runs on another host.)\n`
              )
            })
          },
        },
      },
      // mkcert certs are gitignored and machine-local; only `serve` uses them.
      ...(command === "serve" && hasLocalCerts && !devHttp
        ? {
            https: {
              cert: fs.readFileSync(certPath),
              key: fs.readFileSync(keyPath),
            },
          }
        : {}),
    },
    plugins: [
      // Which workspaces this build carries (build.profiles.ts). First, so it
      // redirects imports of the ones its profile leaves out to stubs before
      // the router plugin or vite's own resolver sees them.
      buildAudiencePlugin(),
      // Single Tailwind pass over www's declared graph (style.context.ts).
      ...createStylePlugins(styleContext),
      TanStackRouterVite({
        autoCodeSplitting: true,
        // src/routes/ is the routing tree. Only `__tests__/` is ignored, not
        // `*.test.tsx` by name, so a test dropped beside a route shows up as
        // a phantom route instead of disappearing.
        routeFileIgnorePattern: String.raw`(^|/)__tests__(/|$)`,
      }),
      viteReact(),
      ...(command === "serve"
        ? [warnMissingContentAssets(), fileHostDevPlugin(fileHost)]
        : []),
      ...(isMobileBuild ? [omitResumePdfs()] : []),
      pagesConnectPolicy(),
    ],
    // An http:// page asks :3000 (the container) directly. While the proxy
    // points elsewhere (`make dev`, FILE_HOST_PROXY_TARGET), route pages
    // through it too. An explicit VITE_FILE_HOST_ENDPOINT still wins; env
    // files are loaded here because Vite reads them after this config.
    ...(command === "serve" &&
    fileHost.source !== "container" &&
    !loadEnv(mode, import.meta.dirname, "VITE_").VITE_FILE_HOST_ENDPOINT
      ? {
          define: {
            "import.meta.env.VITE_FILE_HOST_ENDPOINT": JSON.stringify(
              `${FILE_HOST_PROXY_PATH}/api/v1`
            ),
          },
        }
      : {}),
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
      tsconfigPaths: true,
    },
    build: {
      rolldownOptions: {
        // Two HTML entries, one JS app: /resume is the same SPA under its own
        // document so GitHub Pages serves a real 200 at /resume/ (see
        // resume/index.html).
        input: {
          main: resolve(import.meta.dirname, "index.html"),
          ...(isMobileBuild
            ? {}
            : { resume: resolve(import.meta.dirname, "resume/index.html") }),
        },
        // No `output.manualChunks`: matching with `id.includes(pkg)` under
        // pnpm sweeps in every package with that peer dep in its store path.
        // If manual grouping is ever needed, use `advancedChunks` and match on
        // package boundaries.
        // Production builds drop console calls. Not in the analyze build:
        // this would override the `minify: false` analyze-bundle.js passes.
        output: analyze
          ? {}
          : { minify: { compress: { dropConsole: true }, mangle: true } },
        treeshake: {
          // Every module is treated as side-effect free, so a bare import
          // (`import "@some-ui/x/register"`) is dropped with its load-time
          // effects. This overrides every package manifest's `sideEffects`
          // for JS, but not CSS: Vite's CSS pipeline keeps it regardless.
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          annotations: true,
        },
      },
      // Sourcemaps and the gzip column only for `pnpm build:analyze`.
      sourcemap: analyze,
      reportCompressedSize: analyze,
      // oxc, not terser (faster); `dropConsole` is set via
      // `rolldownOptions.output` above.
      minify: "oxc",
      chunkSizeWarningLimit: 1000,
    },
    // No `esbuild` block: Vite 8 transforms with oxc and ignores it.
  })
)
