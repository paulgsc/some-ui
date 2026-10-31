import { execFileSync } from "node:child_process"
import fs from "node:fs"
import { resolve } from "node:path"
import { createStylePlugins } from "@some-ui/styles/styles-build/dev-config"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import viteReact from "@vitejs/plugin-react"
import type { HtmlTagDescriptor, Plugin, UserConfig } from "vite"
import { defineConfig, loadEnv } from "vite"

import { RELEASE_MINIFY } from "./build.minify.ts"
import { offPathPublicFiles } from "./build.paths.ts"
import { buildAudiencePlugin, MOBILE_PROFILE } from "./build.profiles.ts"
import {
  describeTarget,
  fileHostDevPlugin,
  isBlockedProxyPath,
  resolveFileHostTarget,
} from "./file-host.dev.ts"
import styleContext from "./style.context.ts"

// The dev/preview counterpart of apps/www/nginx.tts-proxy.conf: the same
// same-origin /api/tts/ route, pointed at the port infra/compose/tts.yml
// publishes on the host instead of at the container over the compose
// network. Without it, `vite dev` opened over HTTPS (through Caddy, as
// dev.home.maishatu.com) hits the mixed-content block that path exists to
// avoid, since src/lib/tts-config resolves an HTTPS page to this path.
//
// Kept in step by hand with that nginx snippet and with TTS_PROXY_PATH in
// src/lib/tts-config - importing the constant here would pull an
// `import.meta.env` reader into the config's Node context for one string.
// TTS_PROXY_TARGET covers a PORT other than 5050 in .env, or a backend
// running somewhere other than this machine.
const TTS_PROXY_PATH = "/api/tts"
const ttsProxyTarget = process.env.TTS_PROXY_TARGET || "http://127.0.0.1:5050"

// The dev/preview counterpart of apps/www/nginx.resume-proxy.conf, for the
// LAN /resume-build page. The container publishes no port, so in dev run the
// service on the host instead: `node packages/ui/resume/scripts/serve.mjs`
// (port 3100, or PORT).
const RESUME_PROXY_PATH = "/api/resume"
const resumeProxyTarget =
  process.env.RESUME_PROXY_TARGET || "http://127.0.0.1:3100"

// The same trick for the same reason, one port over: file_host (paulgsc/server)
// serves plain HTTP on 3000 and terminates no TLS, so an https:// page cannot
// fetch it directly - mixed content, blocked before the request leaves the
// page, and no amount of ALLOWED_ORIGINS on the server changes that. This is
// the study origin's only route to sessions and push subscriptions, since a
// service worker requires a secure context in the first place.
//
// Kept in step by hand with the location block in apps/www/nginx.https.conf
// and with FILE_HOST_PROXY_PATH in src/lib/file-host-config - changing it means
// changing all three.
//
// Where it points is file-host.dev.ts's call: paulgsc/server's `make dev` while
// it runs (it records its port when the container already holds 3000), the
// container otherwise, and FILE_HOST_PROXY_TARGET over both.
const FILE_HOST_PROXY_PATH = "/api/file-host"
const fileHost = resolveFileHostTarget()
const fileHostProxyTarget = fileHost.target

// honeycomb's sfx (see scripts/link-content-assets.js) is curated,
// gitignored, and only ever present if a developer symlinked it in on purpose
// - never auto-run on dev startup (see that script's header for why). Without
// it, requests like /sfx/correct.mp3 fall through vite's SPA history fallback
// and come back as index.html, which the browser reports as an opaque
// "Content-Type text/html is not supported" media error. Surface the actual
// cause loudly instead of leaving that to guess.
//
// hangul is deliberately not warned about: its absence is expected and
// legible in the UI on its own (a bundled demo pool), so a startup warning
// would fire on almost every checkout and mean nothing. Topik lessons are not
// a public/ asset at all any more - they come from file_host (#1048).
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

// The Android app carries sessions and nothing else (src/lib/app-surface), so
// its build leaves out the document entry below, which exists only for
// /resume.
const isMobileBuild = process.env.SOME_UI_PROFILE === MOBILE_PROFILE

// `pnpm build:fit` and `build:fit-phone`: build only a ui-fit page, with this
// config (tests/ui-fit/panel-page/main.tsx says why). `WWW_FIT_PAGE` picks
// the page; the panel page unless said.
const isFitHarnessBuild = process.env.WWW_FIT_HARNESS === "1"

const FIT_PAGES = {
  panel: "tests/ui-fit/panel-page/index.html",
  phone: "tests/ui-fit/phone-page/index.html",
} as const

const isFitPage = (page: string): page is keyof typeof FIT_PAGES =>
  Object.hasOwn(FIT_PAGES, page)

function fitPageEntry(): Record<string, string> {
  const page = process.env.WWW_FIT_PAGE ?? "panel"
  if (!isFitPage(page)) {
    throw new Error(
      `WWW_FIT_PAGE=${page} names no ui-fit page; one of ${Object.keys(FIT_PAGES).join(", ")}.`
    )
  }
  // The phone page mounts `apk` workspaces (build.profiles.ts), which every
  // profile but the Android app's stubs with exports that throw. Built under
  // another profile it would mount nothing, and a sweep over it would then
  // fail on every fixture, or pass having measured none.
  if (page === "phone" && process.env.SOME_UI_PROFILE !== MOBILE_PROFILE) {
    throw new Error(
      `The ui-fit phone page is built under SOME_UI_PROFILE=${MOBILE_PROFILE} only (pnpm --filter www build:fit-phone).`
    )
  }
  return {
    [`${page}-page`]: resolve(import.meta.dirname, FIT_PAGES[page]),
  }
}

// What a profile's output carries from public/ that it never loads
// (build.paths.ts, `offPathPublicFiles`; the Android app's résumé PDFs are
// about as much as every other file it ships from public/ together). Vite
// copies public/ wholesale, with no filter of its own, and before the bundle
// is written, so they come out once the build is done.
function omitOffPathPublicFiles(offPath: ReadonlyArray<RegExp>): Plugin {
  let outDir = ""
  return {
    name: "omit-off-path-public-files",
    apply: "build",
    configResolved(config): void {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle(): void {
      for (const name of fs.readdirSync(outDir)) {
        if (offPath.some((file) => file.test(name))) {
          fs.rmSync(resolve(outDir, name))
        }
      }
    },
  }
}

// The GitHub Pages build has no backend and no operator-bound traffic by
// design (`VITE_STATIC_DATA`, `lib/data-mode`), and a static host cannot set
// response headers. A <meta> policy is the one place this build can say so in a
// form the browser enforces: with `connect-src 'self'`, a `fetch`, `WebSocket`
// or beacon to any other origin is blocked, so a later change that adds one
// fails loudly on the demo instead of quietly sending something somewhere.
//
// `connect-src` only: the Pages build already runs without any other policy,
// and widening this to `default-src` would take on the font, image and
// service-worker questions this change does not need to answer. The lan and
// Docker builds are not covered, on purpose: they reach `file_host` on another
// port of the same host (`lib/file-host-config`), a speech provider the person
// chose and a music-overlay socket, none of which `connect-src` can name
// without also blocking a learner's own choices. Those are checked by
// tests/local-mode/no-egress.spec.ts instead.
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

/**
 * The commit this build is made from, which `/assurance` names as the copy
 * of the ledger it shows; empty where there is no git checkout (a Docker
 * build context), and the page then says the commit is not known.
 */
function buildCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

// https://vitejs.dev/config/
export default defineConfig(
  ({ command, mode }): UserConfig => ({
    // GitHub Pages serves this app under /<repo>/ instead of domain root;
    // Docker/nginx and local dev serve it at "/". Unset -> "/" for both.
    base: process.env.VITE_BASE_PATH || "/",
    server: {
      // Loopback, plain HTTP: Caddy serves it to other devices as
      // dev.home.maishatu.com, HMR websocket included (docs/study-nudge.md,
      // "Secure context"); Android's dev loop uses `adb reverse`.
      host: "127.0.0.1",
      allowedHosts: ["dev.home.maishatu.com"],
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
        [RESUME_PROXY_PATH]: {
          target: resumeProxyTarget,
          changeOrigin: true,
          rewrite: (path): string =>
            path.replace(new RegExp(`^${RESUME_PROXY_PATH}`), ""),
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
          // Name the backend, the same way the TTS proxy names its
          // container. Vite's bare "http proxy error: ECONNREFUSED" is the
          // exact message that gets read as a CORS problem and sends
          // someone to reconfigure a server that was already correct.
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
    },
    plugins: [
      // Which workspaces this build carries (build.profiles.ts). First, so it
      // redirects imports of the ones its profile leaves out to stubs before
      // the router plugin or vite's own resolver sees them.
      buildAudiencePlugin(),
      // Single Tailwind pass over www's declared graph (style.context.ts):
      // utilities + the shared design layer are generated exactly once, from an
      // explicit @source set, instead of once per package. See #636.
      ...createStylePlugins(styleContext),
      tanstackRouter({
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
      ...(command === "serve"
        ? [warnMissingContentAssets(), fileHostDevPlugin(fileHost)]
        : []),
      omitOffPathPublicFiles(offPathPublicFiles(process.env.SOME_UI_PROFILE)),
      pagesConnectPolicy(),
    ],
    // An http:// page skips the proxy and asks :3000 directly
    // (src/lib/file-host-config) - the container. While the proxy points
    // anywhere else (`make dev`, or FILE_HOST_PROXY_TARGET), send it through
    // the proxy too, so every page reaches the server the proxy names.
    // An explicit VITE_FILE_HOST_ENDPOINT still wins, from the shell or an
    // env file: Vite reads env files only after this config, so they are
    // loaded here to see one.
    define: {
      "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(buildCommit()),
      ...(command === "serve" &&
      fileHost.source !== "container" &&
      !loadEnv(mode, import.meta.dirname, "VITE_").VITE_FILE_HOST_ENDPOINT
        ? {
            "import.meta.env.VITE_FILE_HOST_ENDPOINT": JSON.stringify(
              `${FILE_HOST_PROXY_PATH}/api/v1`
            ),
          }
        : {}),
    },
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
      tsconfigPaths: true,
    },
    build: {
      // Enable rollup bundle analysis
      rolldownOptions: {
        // The fit build aside (above), two HTML entries, one JS app: both
        // boot the same src/main.tsx/router, so the /resume shell isn't a
        // second copy of the app - it's the same SPA under a route-specific document (see
        // resume/index.html's header comment) that GitHub Pages can serve
        // as a real 200 at /resume/ instead of the generic app-shell
        // 404.html fallback every other unmatched path relies on.
        input: isFitHarnessBuild
          ? fitPageEntry()
          : {
              main: resolve(import.meta.dirname, "index.html"),
              ...(isMobileBuild
                ? {}
                : {
                    resume: resolve(import.meta.dirname, "resume/index.html"),
                  }),
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
        // for `output.codeSplitting` (Rolldown's grouping API) if this ever
        // needs manual grouping again — and match on package *boundaries*,
        // not substrings of the resolved path.
        // Production builds strip console calls (build.minify.ts).
        output: { minify: RELEASE_MINIFY },
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
      // reportCompressedSize gzips every chunk only to print a column (#1449).
      reportCompressedSize: false,
      // Vite 8's default minifier (oxc), not terser: terser's renderChunk was
      // most of the plugin time in every build (#1449). `drop_console` moves
      // with it as oxc's `dropConsole` — set through `rolldownOptions.output`
      // above, which Vite spreads over its own `minify: true`.
      minify: "oxc",
      // Chunk size warnings
      chunkSizeWarningLimit: 1000,
    },
  })
)
