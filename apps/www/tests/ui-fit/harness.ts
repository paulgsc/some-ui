/**
 * Plumbing for the panel sweeps (panel-fit, incident-fit): the viewport sizes
 * they sweep, the panel page (`./panel-page`) built with www's own config,
 * served over HTTP, and the measure of what leaves a fixture's rect. Never
 * `file://`: Chromium blocks cross-origin ES module loads from a file origin,
 * every panel then renders an empty root, and a sweep that does not check
 * for that passes having measured nothing.
 */

import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Repo root, from `apps/www/tests/ui-fit`. */
const REPO_ROOT = resolve(__dirname, "../../../..")

/**
 * Where `pnpm --filter www build:fit` writes the panel page. `out/` because
 * it is ignored at any depth; the build is not part of `dist/`, which ships.
 */
const PANEL_PAGE_BUILD = resolve(
  REPO_ROOT,
  process.env["WWW_FIT_HARNESS_DIST"] ?? "apps/www/out/ui-fit"
)

/** The page's path inside that build: Vite keeps the source's layout. */
const PANEL_PAGE_PATH = "/tests/ui-fit/panel-page/index.html"

function panelPageBuilt(): boolean {
  return existsSync(join(PANEL_PAGE_BUILD, PANEL_PAGE_PATH))
}

export type PanelPage = {
  /** The page's URL, at one fixture when given its id. */
  readonly url: (panel?: string) => string
  /** Skips the calling describe when no build is found, outside CI. */
  readonly skipUnbuilt: () => void
  /** Fails when no build is found: under CI a missing build is a failure. */
  readonly expectBuilt: () => void
}

/**
 * Serves the built panel page for the spec that calls this at its top level.
 * Locally a missing build is a skip with directions; under CI it is a failure,
 * so a build step that broke never turns a sweep into a green run that
 * measured nothing.
 */
export function servePanelPage(): PanelPage {
  const built = panelPageBuilt()
  let site: StaticSite | null = null
  test.beforeAll(async () => {
    if (built) site = await serve(PANEL_PAGE_BUILD)
  })
  test.afterAll(async () => {
    await site?.close()
  })
  return {
    url: (panel) =>
      `${site!.origin}${PANEL_PAGE_PATH}${panel === undefined ? "" : `?panel=${panel}`}`,
    skipUnbuilt: () =>
      test.skip(
        !built && !process.env["CI"],
        `No panel page at ${PANEL_PAGE_BUILD}. Build one first: ` +
          `pnpm --filter www build:fit (or point WWW_FIT_HARNESS_DIST at one).`
      ),
    expectBuilt: () =>
      expect(
        built,
        `No panel page at ${PANEL_PAGE_BUILD}: run pnpm --filter www build:fit.`
      ).toBe(true),
  }
}

const PHONE_LANDSCAPE = {
  name: "phone-landscape",
  width: 780,
  height: 390,
} as const

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
  PHONE_LANDSCAPE,
  { name: "desktop", width: 1680, height: 1050 },
] as const

/**
 * The sizes a phone-only surface is swept at (incident-fit): a tall phone, a
 * narrow one, and the same phone on its side as above. A desktop size would
 * measure such a surface on a device that never shows it.
 */
export const PHONE_VIEWPORTS = [
  { name: "phone-tall", width: 412, height: 915 },
  { name: "phone-narrow", width: 360, height: 780 },
  PHONE_LANDSCAPE,
] as const

export const INCIDENT_FIXTURE = "leetype-incident"

/** Every journey state's card (J0), walked by `./jobs-status-fit.spec.ts`. */
export const JOBS_STATUS_FIXTURE = "jobs-status"

/** Practice Home's two buttons, idle and refused (`./intent-failure-fit.spec.ts`). */
export const INTENT_FAILURE_FIXTURE = "intent-failure"

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

/**
 * A static file server for a build directory, on an ephemeral port. With
 * `fallback` (a file under `root`, e.g. "index.html"), a path that names no
 * file is answered with it, as an app's client-side routes need.
 */
export function serve(
  root: string,
  { fallback }: { fallback?: string } = {}
): Promise<StaticSite> {
  const isFile = (path: string): boolean =>
    path.startsWith(root) && existsSync(path) && !statSync(path).isDirectory()
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    const asked = join(root, decodeURIComponent(url.pathname))
    const filePath =
      isFile(asked) || fallback === undefined ? asked : join(root, fallback)

    if (!isFile(filePath)) {
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

/**
 * Deliberate escapes, matched against `data-fit-intent` on the element or any
 * ancestor. Same shape as the sweep's scroll intents, for the same reason: an
 * opt-out should be a greppable act in the component, not a class name that
 * happens to look intentional.
 */
const ALLOWED_FIT_INTENTS = new Set([
  // A marquee's whole mechanic is translating a track wider than its window.
  "marquee",
  // Decorative motion (particles, glows) that is clipped by design.
  "ambient",
])

/**
 * One way a panel can break the contract, in the terms the fix is written in.
 *
 *   `escape` the element paints outside the granted rect. A panel asking for
 *           more than it was given - `min-h-screen` on a panel root, a row of
 *           chips that will not wrap.
 *   `leak`  a box with a definite size holds content it cannot contain and
 *           does not clip it, so the excess paints over whatever the layout
 *           put next to it. This is #899 exactly: the quiz summary's card was
 *           `h-full` around 950px of content, and the difference landed on the
 *           panel below. A box that sizes to its content cannot leak - its
 *           `scrollHeight` and `clientHeight` are equal - so this only ever
 *           fires where something really did assert a size.
 */
export type Violation = {
  kind: "escape" | "leak"
  tag: string
  classes: string
  overY: number
  overX: number
}

/** Everything the panel does that its rect does not permit, worst first. */
export async function findViolations(
  page: Page
): Promise<{ mounted: boolean; violations: Array<Violation> }> {
  return page.evaluate(
    (allowed: Array<string>) => {
      const intents = new Set(allowed)
      const root = document.querySelector("[data-fit-slot]")
      if (!root || root.childElementCount === 0) {
        return { mounted: false, violations: [] }
      }

      const rect = root.getBoundingClientRect()
      const violations: Array<Violation> = []
      const isClipping = (style: CSSStyleDeclaration): boolean =>
        style.overflowX !== "visible" || style.overflowY !== "visible"

      for (const element of Array.from(
        root.querySelectorAll<HTMLElement>("*")
      )) {
        // SVG internals are geometry, not layout - a path's bounding box says
        // nothing about whether the chart drawn from it fits.
        if (element.closest("svg")) continue

        const style = getComputedStyle(element)
        // The overlay plane (toasts, popovers, dialogs) is not part of the
        // layout tree the viewport tiles - see docs/session-viewport.
        if (style.position === "fixed") continue
        // Nothing that paints nothing can overflow: a hover tooltip parked
        // outside the panel at `opacity: 0` is not content spilling out.
        if (
          !element.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
            contentVisibilityAuto: true,
          })
        ) {
          continue
        }

        const declared = element.closest("[data-fit-intent]")
        const intent = declared?.getAttribute("data-fit-intent") ?? null
        if (intent !== null && intents.has(intent)) continue

        const tag = element.tagName.toLowerCase()
        const classes = element.className.toString().slice(0, 120)
        const box = element.getBoundingClientRect()

        // A box that clips or scrolls has resolved its own overflow; what
        // matters then is whether *it* fits, which is measured on its own turn.
        if (!isClipping(style) && element.clientHeight > 0) {
          const overY = element.scrollHeight - element.clientHeight
          const overX = element.scrollWidth - element.clientWidth
          if (overY > 2 || overX > 2) {
            violations.push({ kind: "leak", tag, classes, overY, overX })
            continue
          }
        }

        if (box.width === 0 || box.height === 0) continue

        // Content inside a clipping or scrolling ancestor cannot paint outside
        // the rect however long it is - the ancestor is the one on the hook.
        let clipped = false
        for (
          let ancestor = element.parentElement;
          ancestor && ancestor !== root;
          ancestor = ancestor.parentElement
        ) {
          if (isClipping(getComputedStyle(ancestor))) {
            clipped = true
            break
          }
        }
        if (clipped) continue

        const overY = Math.round(box.bottom - rect.bottom)
        const overX = Math.round(box.right - rect.right)
        // Sub-pixel rounding at fractional zoom is not an overflow.
        if (overY <= 2 && overX <= 2) continue

        violations.push({ kind: "escape", tag, classes, overY, overX })
      }

      violations.sort(
        (a, b) => Math.max(b.overY, b.overX) - Math.max(a.overY, a.overX)
      )
      return { mounted: true, violations: violations.slice(0, 3) }
    },
    [...ALLOWED_FIT_INTENTS]
  )
}

/** One violation, said in the terms of the fix rather than the measurement. */
export function describeViolation(where: string, violation: Violation): string {
  const at = `${where}: <${violation.tag}>`
  const classes = `classes: ${violation.classes}`

  if (violation.kind === "leak") {
    return (
      `${at} holds ${violation.overY}px more content than its own height ` +
      `(and ${violation.overX}px more than its width) and does not clip it, ` +
      `so the excess paints over whatever is laid out next to it. Fit the ` +
      `content to the box — tabs, a measured page, a smaller surface ` +
      `(docs/ui-fit) — or, if the scroll is the interaction, declare it with ` +
      `data-scroll-intent. ${classes}`
    )
  }

  return (
    `${at} paints ${violation.overY}px below / ${violation.overX}px right ` +
    `of the granted rect — the panel is asking for more room than the layout ` +
    `gave it. Take the rect as given (no min-h-screen on a panel root; wrap ` +
    `rows that cannot fit), or declare the escape with data-fit-intent. ` +
    `${classes}`
  )
}
