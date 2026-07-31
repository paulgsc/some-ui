/**
 * The repo-wide "content fits its box" gate.
 *
 * Every UI component in this monorepo already has stories, and Storybook's
 * static build emits an `index.json` naming all of them. That makes it the one
 * place a single test can hold *all* UI — present and future — to the same
 * rule, with no per-component work: a new component that ships a story is
 * covered the day it lands, and one that ships without a story is the only way
 * to opt out (which is itself worth noticing in review).
 *
 * Two things are asserted per story, at three viewport sizes:
 *
 *   1. Nothing overflows the page horizontally. A sideways scrollbar is never
 *      a design choice at these sizes; it is always a box that was handed
 *      content wider than itself.
 *   2. No element is a *greedy* scroll container - one that scrolls because it
 *      was told `overflow-auto` and then given more than it can hold, rather
 *      than because scrolling is what it is for. Deliberate ones opt out by
 *      name (see ALLOWED_SCROLLERS).
 *
 * Run against a built Storybook:
 *
 *   STORYBOOK_WORKSPACE=leetype pnpm build-storybook -o storybook-static
 *   STORYBOOK_STATIC=storybook-static pnpm --filter www test:e2e tests/ui-fit
 *
 * Skips itself with a clear message when no build is pointed at, so it never
 * fails for the wrong reason on a machine that hasn't built Storybook.
 *
 * The build is served over HTTP rather than opened as `file://`. That is not a
 * preference: Chromium refuses cross-origin ES module loads from a file
 * origin, so every story renders as an empty root and the sweep passes
 * vacuously - it reports success having measured nothing at all. The
 * `rendersSomething` guard below exists so that failure mode can never come
 * back silently.
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "../../../..")

/** Where the static Storybook lives, if one was built. */
const STORYBOOK_STATIC = resolve(
  REPO_ROOT,
  process.env["STORYBOOK_STATIC"] ?? "storybook-static"
)

/**
 * Sizes chosen for what they prove, not for device names: the shortest
 * viewport a laptop realistically presents (a browser with devtools docked),
 * a narrow phone, and a large desktop. A panel that fits all three has been
 * fitted rather than tuned to one breakpoint.
 */
const VIEWPORTS = [
  { name: "short-laptop", width: 1280, height: 560 },
  { name: "phone", width: 390, height: 720 },
  { name: "desktop", width: 1680, height: 1050 },
] as const

/**
 * Scroll containers that are meant to scroll. Anything not on this list that
 * scrolls is the pattern this test exists to stop: reaching for
 * `overflow-auto` instead of bounding, tabbing, or paging the content.
 *
 * Matched against the element's `data-scroll-intent` attribute, so opting out
 * is an explicit, greppable act in the component rather than a class name that
 * happens to look deliberate.
 */
const ALLOWED_SCROLL_INTENTS = new Set([
  // Long-form source the player reads and types through - the scroll *is* the
  // interaction, not a fallback.
  "code-display",
  // Prose documents whose length is the author's, not the layout's.
  "long-form",
])

/**
 * Stories that do not mount in a built Storybook at all, with the reason.
 *
 * An allowlist rather than a silent skip: a story that renders nothing cannot
 * be checked, and letting that read as a pass is the exact failure this spec
 * guards against everywhere else. Listing them keeps the debt greppable and
 * makes removing an entry the natural close-out when the cause is fixed.
 *
 * These all reach `useTypingGame` -> the leetype wasm module, whose `.wasm`
 * asset 404s in the static build (`TypeError: f is not a function` out of
 * use-preview-game). Pre-existing and unrelated to layout - they are broken in
 * Storybook today, sweep or no sweep.
 */
const NON_RENDERING_STORIES: ReadonlyArray<string> = [
  "ui-input-components-typing-codedisplay--",
  "ui-input-components-typing-codeinputcard--",
  "ui-input-components-typing-leetype--",
  "ui-input-components-typing-leetypeapp--",
]

type StoryEntry = { id: string; title: string; name: string; type?: string }

type Offender = {
  tag: string
  intent: string | null
  classes: string
  scrollHeight: number
  clientHeight: number
}

function loadStoryIds(): Array<StoryEntry> {
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

const STORIES = loadStoryIds()

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

/** A static file server for the built Storybook, on an ephemeral port. */
function serve(
  root: string
): Promise<{ origin: string; close: () => Promise<void> }> {
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

async function findOverflow(page: Page): Promise<{
  rendersSomething: boolean
  documentScrollsSideways: boolean
  greedyScrollers: Array<Offender>
}> {
  return page.evaluate(
    (allowed: Array<string>) => {
      const allowedIntents = new Set(allowed)
      const greedy: Array<Offender> = []

      for (const element of Array.from(
        document.querySelectorAll<HTMLElement>("*")
      )) {
        const style = getComputedStyle(element)
        const scrolls =
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          element.scrollHeight - element.clientHeight > 2

        if (!scrolls) continue

        const intent = element.getAttribute("data-scroll-intent")
        if (intent !== null && allowedIntents.has(intent)) continue

        greedy.push({
          tag: element.tagName.toLowerCase(),
          intent,
          classes: element.className.toString().slice(0, 200),
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        })
      }

      const root = document.getElementById("storybook-root")

      return {
        // Proof the story actually mounted. Without it a broken harness reads as
        // a clean sweep, which is worse than a red one.
        rendersSomething: (root?.childElementCount ?? 0) > 0,
        documentScrollsSideways:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 2,
        greedyScrollers: greedy,
      }
    },
    [...ALLOWED_SCROLL_INTENTS]
  )
}

// One test walks every story at one viewport, so the budget is the whole
// sweep's rather than a single page's - the config's 15s default is sized for
// the fixture specs next door, which load exactly one page each.
test.describe.configure({ timeout: 10 * 60 * 1000 })

let storybook: { origin: string; close: () => Promise<void> } | null = null

test.beforeAll(async () => {
  if (STORIES.length > 0) storybook = await serve(STORYBOOK_STATIC)
})

test.afterAll(async () => {
  await storybook?.close()
})

test.describe("every story fits the box it is given", () => {
  test.skip(
    STORIES.length === 0,
    `No built Storybook at ${STORYBOOK_STATIC}. Build one first: ` +
      `pnpm build-storybook -o storybook-static (optionally with STORYBOOK_WORKSPACE=<pkg>), ` +
      `then re-run with STORYBOOK_STATIC pointing at it.`
  )

  for (const viewport of VIEWPORTS) {
    test(`no overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      })

      const failures: Array<string> = []

      for (const story of STORIES) {
        await page.goto(
          `${storybook!.origin}/iframe.html?id=${story.id}&viewMode=story`,
          { waitUntil: "load" }
        )
        // Stories that measure themselves need a frame to settle; the fitted
        // pager deliberately converges over one or two.
        await page.waitForTimeout(150)

        const { rendersSomething, documentScrollsSideways, greedyScrollers } =
          await findOverflow(page)

        if (!rendersSomething) {
          const known = NON_RENDERING_STORIES.some((prefix) =>
            story.id.startsWith(prefix)
          )
          if (!known) {
            failures.push(
              `${story.title} / ${story.name}: rendered nothing — the sweep ` +
                `cannot measure this story, so treat it as a harness failure, ` +
                `not a pass. Fix the story, or add it to NON_RENDERING_STORIES ` +
                `with the reason.`
            )
          }
          continue
        }

        if (documentScrollsSideways) {
          failures.push(`${story.title} / ${story.name}: scrolls sideways`)
        }
        for (const offender of greedyScrollers) {
          failures.push(
            `${story.title} / ${story.name}: <${offender.tag}> scrolls ` +
              `(${offender.scrollHeight}px of content in ${offender.clientHeight}px) — ` +
              `bound, tab, or page it, or mark it data-scroll-intent="…" if the ` +
              `scroll is the point. classes: ${offender.classes}`
          )
        }
      }

      expect(failures, failures.join("\n")).toEqual([])
    })
  }
})
