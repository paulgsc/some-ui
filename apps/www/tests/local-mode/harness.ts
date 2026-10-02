/**
 * Plumbing for the local-mode traffic spec next door: the *built* app served
 * over a throwaway origin, and a stand-in `file_host` that writes down what it
 * is sent.
 *
 * ## Why the built app, and why a stand-in server
 *
 * The unit tests prove each module asks the authority before it sends. They
 * cannot prove nothing else in the bundle sends: a library, a prefetch, an
 * import with a side effect. Only a browser running the output can say what
 * actually leaves, and a recorded request is the one piece of evidence nobody
 * has to interpret.
 *
 * `http://127.0.0.1` is a secure context by the same exception `localhost`
 * has, so a plain Node server is a legitimate origin: no certificates, no
 * container. The lan build asks `http://<host>:3000` for `file_host` when it is
 * served over `http:` (`lib/file-host-config`), so the stand-in listens on
 * 3000, which is also where a real one would be.
 *
 * ## Where the builds come from
 *
 * Not from here. `WWW_DIST_LAN` and `WWW_DIST_PAGES` name the two build
 * outputs (relative to the repository root, or absolute). A suite that quietly
 * measured nothing would be worse than none, so a missing one fails under `CI`
 * and skips only on a developer's machine, with the command to produce it.
 */

import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import type { IncomingMessage, Server } from "node:http"
import { dirname, extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Repo root, from `apps/www/tests/local-mode`. */
const REPO_ROOT = resolve(__dirname, "../../../..")

export const FILE_HOST_PORT = 3000

export type BuildName = "lan" | "pages"

const ENV: Record<BuildName, string> = {
  lan: "WWW_DIST_LAN",
  pages: "WWW_DIST_PAGES",
}

const HOW: Record<BuildName, string> = {
  lan: "pnpm --filter www exec vite build --outDir dist",
  pages:
    "SOME_UI_PROFILE=pages VITE_STATIC_DATA=true VITE_BASE_PATH=/some-ui/ pnpm --filter www exec vite build --outDir dist-pages",
}

/** The build's directory, or why there is none. */
export function builtApp(name: BuildName): { dir: string } | { why: string } {
  const given = process.env[ENV[name]]
  if (!given) {
    return { why: `${ENV[name]} is not set (build it with: ${HOW[name]})` }
  }
  const dir = resolve(REPO_ROOT, given)
  if (!existsSync(join(dir, "index.html"))) {
    return { why: `${dir} has no index.html (build it with: ${HOW[name]})` }
  }
  return { dir }
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
}

export type Listening = {
  origin: string
  port: number
  close: () => Promise<void>
}

function listen(server: Server, port: number): Promise<Listening> {
  return new Promise((done, fail) => {
    server.once("error", fail)
    server.listen(port, "127.0.0.1", () => {
      const address = server.address()
      const bound = typeof address === "object" && address ? address.port : port
      done({
        origin: `http://127.0.0.1:${String(bound)}`,
        port: bound,
        close: () =>
          new Promise<void>((closed) => {
            server.closeAllConnections()
            server.close(() => {
              closed()
            })
          }),
      })
    })
  })
}

/**
 * The app's files under `base` (`/` for lan, `/some-ui/` for Pages), with the
 * single-page fallback both real hosts give: an unknown path answers the shell.
 */
export function serveBuild(dir: string, base: string): Promise<Listening> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")
    if (!path.startsWith(base)) {
      res.writeHead(404).end()
      return
    }
    const relative = normalize(path.slice(base.length)).replace(
      /^(\.\.[/\\])+/,
      ""
    )
    let file = join(dir, relative)
    if (
      !file.startsWith(dir) ||
      !existsSync(file) ||
      statSync(file).isDirectory()
    ) {
      const index = join(file, "index.html")
      file =
        file.startsWith(dir) && existsSync(index)
          ? index
          : join(dir, "index.html")
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    })
    createReadStream(file).pipe(res)
  })
  return listen(server, 0)
}

export type Received = {
  method: string
  path: string
  cookie: string | undefined
}

/**
 * A stand-in `file_host` that answers every route with an empty 404 and keeps
 * what it was sent. CORS is open to the asking origin, with credentials, so a
 * request that *would* carry the cookie is able to, and the spec can see it do
 * so (the control that makes "no cookie" mean something).
 */
export async function startFileHost(): Promise<
  Listening & { received: Array<Received> }
> {
  const received: Array<Received> = []
  const server = createServer((req: IncomingMessage, res) => {
    const origin = req.headers.origin
    const cors: Record<string, string> =
      typeof origin === "string"
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            "access-control-allow-headers": "content-type",
            "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE",
            vary: "Origin",
          }
        : {}
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end()
      return
    }
    received.push({
      method: req.method ?? "GET",
      path: req.url ?? "",
      cookie: req.headers.cookie,
    })
    res
      .writeHead(404, { ...cors, "content-type": "application/json" })
      .end("{}")
  })
  const listening = await listen(server, FILE_HOST_PORT)
  return { ...listening, received }
}
