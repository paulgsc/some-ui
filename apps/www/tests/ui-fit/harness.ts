/**
 * Plumbing for the panel sweep (panel-fit): the viewport sizes it sweeps, and
 * the panel page (`./panel-page`) built with www's own config, served over
 * HTTP. Never `file://`: Chromium blocks cross-origin ES module loads from a
 * file origin, every panel then renders an empty root, and a sweep that does
 * not check for that passes having measured nothing.
 */

import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Repo root, from `apps/www/tests/ui-fit`. */
const REPO_ROOT = resolve(__dirname, "../../../..")

/**
 * Where `pnpm --filter www build:fit` writes the panel page. `out/` because
 * it is ignored at any depth; the build is not part of `dist/`, which ships.
 */
export const PANEL_PAGE_BUILD = resolve(
  REPO_ROOT,
  process.env["WWW_FIT_HARNESS_DIST"] ?? "apps/www/out/ui-fit"
)

/** The page's path inside that build: Vite keeps the source's layout. */
export const PANEL_PAGE_PATH = "/tests/ui-fit/panel-page/index.html"

/** Whether a panel page has been built where the sweep looks for one. */
export function panelPageBuilt(): boolean {
  return existsSync(join(PANEL_PAGE_BUILD, PANEL_PAGE_PATH))
}

/**
 * Sizes chosen for what they prove, not for device names: the shortest
 * viewport a laptop realistically presents (a browser with devtools docked),
 * a narrow phone, a large desktop - and a phone turned sideways.
 *
 * That last one is here because its absence was load-bearing. Three portrait
 * or landscape-*desktop* sizes cannot fail on a phone in landscape, so a
 * workspace could be genuinely unusable in that orientation and still pass
 * this sweep cleanly - which is not the suite being lenient, it is the suite
 * never having rendered the case at all. The composer's own catalogue box
 * (`apps/www/src/components/composer`) took 82% of a 780x390 window and
 * pushed the wizard's Continue button below the fold for as long as this list
 * had three entries.
 *
 * It is also the orientation that breaks the most assumptions at once, which
 * is exactly why it earns a slot rather than being a fourth variation on the
 * same shape:
 *
 *   - every width breakpoint below `md` reads as true, so a layout believes
 *     it has a tablet's room while the axis it is actually short of is height;
 *   - fixed chrome that is a fine fraction of 780px of height is most of
 *     390px;
 *   - and a document that outgrows the window here does so under chrome that
 *     is pinned to the viewport, which is how a scrolling route tears the
 *     shell's own background (see the `h-svh` note in `sidebar.tsx`).
 *
 * A surface that fits all four has been fitted. A surface that fits the first
 * three has been fitted for people holding their phone the usual way.
 */
export const VIEWPORTS = [
  { name: "short-laptop", width: 1280, height: 560 },
  { name: "phone", width: 390, height: 720 },
  { name: "phone-landscape", width: 780, height: 390 },
  { name: "desktop", width: 1680, height: 1050 },
] as const

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
}

export type StaticSite = { origin: string; close: () => Promise<void> }

/** A static file server for a build directory, on an ephemeral port. */
export function serve(root: string): Promise<StaticSite> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    const filePath = join(root, decodeURIComponent(url.pathname))

    if (
      !filePath.startsWith(root) ||
      !existsSync(filePath) ||
      statSync(filePath).isDirectory()
    ) {
      response.writeHead(404).end()
      return
    }

    response.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    })
    createReadStream(filePath).pipe(response)
  })

  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      resolveServer({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}
