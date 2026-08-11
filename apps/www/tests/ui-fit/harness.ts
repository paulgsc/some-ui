/**
 * Shared plumbing for the two Storybook-driven fit sweeps next door.
 *
 * Both need the same three things and neither should own them: a static
 * Storybook served over HTTP (never `file://` - Chromium blocks cross-origin
 * ES module loads from a file origin, and every story then renders an empty
 * root and the sweep passes having measured nothing), the story index, and one
 * agreed set of viewport sizes.
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Repo root, from `apps/www/tests/ui-fit`. */
const REPO_ROOT = resolve(__dirname, "../../../..")

/** Where the static Storybook lives, if one was built. */
export const STORYBOOK_STATIC = resolve(
  REPO_ROOT,
  process.env["STORYBOOK_STATIC"] ?? "storybook-static"
)

/**
 * Sizes chosen for what they prove, not for device names: the shortest
 * viewport a laptop realistically presents (a browser with devtools docked),
 * a narrow phone, and a large desktop. A surface that fits all three has been
 * fitted rather than tuned to one breakpoint.
 */
export const VIEWPORTS = [
  { name: "short-laptop", width: 1280, height: 560 },
  { name: "phone", width: 390, height: 720 },
  { name: "desktop", width: 1680, height: 1050 },
] as const

export type StoryEntry = {
  id: string
  title: string
  name: string
  type?: string
}

/** Every non-docs story in the built Storybook, or `[]` if none was built. */
export function loadStoryIds(): Array<StoryEntry> {
  const indexPath = resolve(STORYBOOK_STATIC, "index.json")
  if (!existsSync(indexPath)) return []

  const parsed: unknown = JSON.parse(readFileSync(indexPath, "utf8"))
  if (typeof parsed !== "object" || parsed === null || !("entries" in parsed)) {
    return []
  }

  const entries: unknown = parsed.entries
  if (typeof entries !== "object" || entries === null) return []

  // Storybook's index is external JSON, so each row is narrowed rather than
  // asserted - a shape change should drop rows, not crash the sweep.
  return Object.values(entries).flatMap((entry): Array<StoryEntry> => {
    if (typeof entry !== "object" || entry === null) return []
    const row: Record<string, unknown> = { ...entry }
    const { id, title, name, type } = row
    if (
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof name !== "string"
    ) {
      return []
    }
    if (type === "docs") return []
    return [
      { id, title, name, type: typeof type === "string" ? type : undefined },
    ]
  })
}

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

/** A static file server for the built Storybook, on an ephemeral port. */
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
