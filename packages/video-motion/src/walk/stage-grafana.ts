/**
 * The Grafana stage: a throwaway Grafana that a Site Assets job starts on
 * GitHub (`scripts/dashboards-on-sample.sh`), serving the dashboards compiled
 * from paulgsc/server's jsonnet over sample telemetry, its panels opened one
 * by one at a fixed size, theme and time range, in a Chromium with nothing
 * else in it (`./home-dashboards`). Grafana lets an anonymous Viewer read, so
 * the walk holds no key.
 *
 * Only Grafana is reached:
 *
 * - Every request is fetched here, never by the browser: one for another
 *   origin is refused, one to Grafana follows no redirect, and a redirect it
 *   answers is refused and fails the walk (one to the login page would be
 *   photographed).
 * - Service workers are blocked and every WebSocket closed: neither passes
 *   through the routes above.
 *
 * A script error, an answer from Grafana that is not a success, or a panel
 * that says it has no data fails the walk: a panel that did not draw is not
 * the dashboard. A screen is taken once, after the page's last navigation, a
 * panel's query has answered, nothing is in flight, no panel is loading, and
 * the fonts and two frames are drawn, and it is kept once two screens in a
 * row are the same.
 */

import { writeFile } from "node:fs/promises"
import type { Page, Request } from "playwright-core"
import { chromium } from "playwright-core"

import { heldStill } from "./held-still"
import type { Stage, WalkViewport } from "./run"
import { settlePage } from "./stage-sandbox"

/** How long a panel may take to fetch and draw its data. */
const DRAWN_MS = 30_000

/** Grafana's query endpoint: a panel has its data once one answers. */
const QUERY = "/api/ds/query"

export type GrafanaStageSpec = {
  readonly kind: "grafana"
  /** The version of what the dashboards show (file_host's), which the walk names. */
  readonly version: string
  /** Grafana, as the walk reaches it (`http://127.0.0.1:3000` on the runner). */
  readonly origin: string
  /** The page the walk opens, a path and query under the origin. */
  readonly page: string
  readonly viewport: { readonly width: number; readonly height: number }
  /**
   * Words drawn in a band at the top centre of every screen, over the
   * picture, so a screen shown on its own (in an essay) says what it is:
   * the walks an essay shows name their sample data here (#3476). Absent,
   * nothing is drawn over Grafana's own page.
   */
  readonly band?: string
  /**
   * How many panels each row the walk shoots, by its title, may draw "no
   * data": a stat whose query is empty by design (a longest wait with
   * nothing waiting). A screen with more fails, as every other screen does
   * with any.
   */
  readonly noData?: Readonly<Record<string, number>>
}

/** Grafana answers, or the walk stops before a page is opened. */
async function reached(page: Page, origin: string): Promise<void> {
  const answer = await page.request.get(`${origin}/api/health`, {
    maxRedirects: 0,
  })
  if (!answer.ok()) {
    throw new Error(`Grafana's health answered ${String(answer.status())}`)
  }
}

/** How many more screens a panel may take to hold still, and the gap between them. */
const STILL_TRIES = 20
const STILL_GAP_MS = 250

/** What Grafana draws in a panel whose query answered nothing, in either case. */
const NO_DATA = /^\s*no data\s*$/i

/** Grafana's Inter, as its theme declares it (normal, 400 and 500), by file. */
const INTER = [
  { weight: "400", file: "Inter-Regular.woff2" },
  { weight: "500", file: "Inter-Medium.woff2" },
] as const

/**
 * A script that adds Grafana's own Inter files to a page's fonts from their
 * bytes, which a page has at once: a font made from bytes is loaded when it
 * is made, so the page's first measure of its text uses it.
 */
async function interFaces(page: Page, origin: string): Promise<string> {
  const faces: Array<{ weight: string; data: string }> = []
  for (const { weight, file } of INTER) {
    const answer = await page.request.get(
      `${origin}/public/fonts/inter/${file}`,
      { maxRedirects: 0 }
    )
    if (!answer.ok()) {
      throw new Error(`Grafana's ${file} answered ${String(answer.status())}`)
    }
    faces.push({ weight, data: (await answer.body()).toString("base64") })
  }
  return `(() => {
    for (const { weight, data } of ${JSON.stringify(faces)}) {
      const text = atob(data)
      const bytes = new Uint8Array(text.length)
      for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i)
      const face = new FontFace("Inter", bytes.buffer, { weight, style: "normal" })
      // Made from bytes, a face is loaded at once or never: one that was
      // not would leave the measure racing again, so it fails the walk.
      if (face.status !== "loaded") throw new Error("Inter " + weight + " did not load")
      document.fonts.add(face)
    }
  })()`
}

/**
 * The query parameter a dashboard page carries to be shot as one of its
 * rows, by title. Grafana rewrites a dashboard's URL once it loads, so the
 * stage reads it from the page's own request, not from the address shown.
 */
export const ROW_PARAM = "walk-row"

/**
 * A Grafana walk's screen, as its pictures make it (WALK10, #3499): as wide
 * as the stage, as tall as the tallest picture taken, a row clipped to its
 * box or the whole screen. screen-zoom draws each picture as wide as the
 * screen from its top, so a screen taller than every picture would only
 * shrink them, and one shorter would cut one off.
 */
export function walkScreen(stage: {
  readonly width: number
  readonly height: number
}): {
  /** One picture taken: a row's box, or the whole screen (`undefined`). */
  readonly took: (shot: { readonly height: number } | undefined) => void
  readonly viewport: () => WalkViewport
} {
  let tallest = 0
  return {
    took: (shot): void => {
      tallest = Math.max(
        tallest,
        shot === undefined ? stage.height : Math.ceil(shot.height)
      )
    },
    viewport: () => ({
      width: stage.width,
      height: tallest > 0 ? tallest : stage.height,
      scale: 1,
    }),
  }
}

/** The row a page's request names, if it names one. */
const rowOf = (url: string): string | undefined =>
  new URL(url).searchParams.get(ROW_PARAM) ?? undefined

/** A box on the screen. */
type Box = { x: number; y: number; width: number; height: number }

/** A row's title, and its toggle, in Grafana 13's dashboard, by their test ids. */
/** A title as a CSS string's content: backslashes and quotes escaped, line breaks as code points. */
const cssString = (text: string): string =>
  text
    .replace(/[\\"]/g, (c) => `\\${c}`)
    .replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)
const rowTitle = (title: string): string =>
  `[data-testid="data-testid dashboard-row-title-${cssString(title)}"]`
const rowToggle = (title: string): string =>
  `[data-testid="data-testid dashboard-row-toggle-for-${cssString(title)}"]`

/**
 * Where a row is on the screen: from its title to the bottom of the last of
 * its panels (those whose top lies between its title and the next row's),
 * the screen's full width; or none, if it has no panel on screen (a
 * collapsed row).
 */
async function rowBox(page: Page, title: string): Promise<Box | undefined> {
  const tops = async (selector: string): Promise<Array<Box>> => {
    const boxes: Array<Box> = []
    for (const e of await page.locator(selector).all()) {
      const box = await e.boundingBox()
      if (box !== null) boxes.push(box)
    }
    return boxes
  }
  const [own] = await tops(rowTitle(title))
  if (own === undefined) return undefined
  const next = (await tops('[data-testid^="data-testid dashboard-row-title-"]'))
    .map((b) => b.y)
    .filter((y) => y > own.y + 1)
    .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY)
  const bottoms = (await tops("[data-viz-panel-key]"))
    .filter((b) => b.y > own.y && b.y < next)
    .map((b) => b.y + b.height)
  const width = page.viewportSize()?.width
  if (bottoms.length === 0 || width === undefined) return undefined
  const y = Math.max(0, Math.floor(own.y - 8))
  return { x: 0, y, width, height: Math.ceil(Math.max(...bottoms) + 8) - y }
}

/**
 * The band (`GrafanaStageSpec.band`): its words on one line in a dark pill
 * at the top centre of the screen taken, the row's box or the whole
 * screen, where a row's title line and a panel's header leave room, drawn
 * again on every screen since each is a new document.
 */
async function drawBand(
  page: Page,
  words: string,
  shot: Box | undefined
): Promise<void> {
  const size = page.viewportSize()
  const left = shot === undefined ? 0 : shot.x
  const width = shot === undefined ? (size?.width ?? 0) : shot.width
  const top = shot === undefined ? 0 : shot.y
  const style = {
    position: "fixed",
    top: `${String(top + 6)}px`,
    left: `${String(left + width / 2)}px`,
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    zIndex: "2147483647",
    padding: "3px 12px",
    borderRadius: "999px",
    background: "rgba(17, 24, 33, 0.92)",
    color: "#e6edf3",
    // A weight the stage preloads (`INTER`), so the band never waits on a font.
    font: "500 13px Inter, sans-serif",
    letterSpacing: "0.02em",
    border: "1px solid rgba(230, 237, 243, 0.35)",
    pointerEvents: "none",
  }
  // A string, run in the page: Node's types have no document. A screen
  // settled twice (a walk's first) keeps one band.
  await page.evaluate(
    `(() => { document.querySelectorAll("[data-walk-band]").forEach((old) => old.remove());` +
      ` const band = document.createElement("div");` +
      ` band.textContent = ${JSON.stringify(words)};` +
      ` band.setAttribute("data-walk-band", "");` +
      ` Object.assign(band.style, ${JSON.stringify(style)});` +
      ` document.body.append(band); })()`
  )
}

export async function openGrafanaStage(
  spec: GrafanaStageSpec,
  chrome: string
): Promise<Stage> {
  const origin = new URL(spec.origin).origin
  // Every pixel drawn on the CPU, one way: a canvas (uPlot's charts, a
  // stat's sparkline) drawn on the GPU's raster paths can differ by a pixel
  // of antialiasing from one load to the next.
  const browser = await chromium.launch({
    executablePath: chrome,
    args: [
      "--disable-gpu",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu-rasterization",
      "--disable-partial-raster",
      "--disable-skia-runtime-opts",
      "--force-color-profile=srgb",
    ],
  })
  try {
    const context = await browser.newContext({
      viewport: spec.viewport,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "UTC",
      serviceWorkers: "block",
    })
    const page = await context.newPage()
    const problems: Array<string> = []
    // Each query answered, and how many there were when the page last
    // navigated: a new page is drawn once one more has answered.
    let queries = 0
    let atNavigation = 0
    // Which document a request belongs to: one from a page the walk has left
    // may fail as it is cancelled, which is no problem of the page shown.
    let documents = 0
    // The page last asked for, as asked (Grafana rewrites what it shows).
    let requested = ""
    page.on("pageerror", (e) => problems.push(e.message))
    // A popup's first navigation has no frame yet, and `frame()` throws
    // for it: such a request is not the page's own.
    const isMainFrame = (request: Request): boolean => {
      try {
        return request.frame() === page.mainFrame()
      } catch {
        return false
      }
    }
    await context.routeWebSocket("**", (socket) => socket.close())
    await context.route("**/*", async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin !== origin) {
        await route.abort("blockedbyclient")
        return
      }
      // A new document (never a same-page URL change): its panels are
      // drawn once one more query has answered.
      if (request.isNavigationRequest() && isMainFrame(request)) {
        atNavigation = queries
        documents += 1
        requested = request.url()
      }
      const document = documents
      try {
        const answer = await route.fetch({ maxRedirects: 0 })
        const status = answer.status()
        if (status >= 300) {
          problems.push(`${url.pathname} answered ${String(status)}`)
          await route.abort("failed")
          return
        }
        // Only the page shown: a query of the page just left that answers
        // late is no sign the new one is drawn.
        if (url.pathname === QUERY && document === documents) queries += 1
        await route.fulfill({ response: answer })
      } catch (e) {
        // A dropped connection or a timeout is said; a request of a page
        // already left is only answered. None is left hanging.
        if (document === documents) {
          problems.push(
            `${url.pathname}: ${e instanceof Error ? e.message : "failed"}`
          )
        }
        // Ignored: a route already answered or cancelled cannot be aborted,
        // and the failure is already said above when it is the page's.
        await route.abort("failed").catch(() => undefined)
      }
    })
    await reached(page, origin)

    /** Nothing in flight, no panel loading, and the page still. */
    const idle = async (): Promise<void> => {
      await page.waitForLoadState("networkidle", { timeout: DRAWN_MS })
      await page
        .locator('[aria-label="Panel loading bar"]')
        .first()
        .waitFor({ state: "detached", timeout: DRAWN_MS })
      await settlePage(page)
    }

    /** Where the next screen is taken: a row's box, or the whole screen. */
    let shot: Box | undefined

    /** The walk's screen, as tall as its tallest picture (WALK10). */
    const screen = walkScreen(spec.viewport)

    /** A panel's query answered since the page navigated, then the page still. */
    const drawn = async (): Promise<void> => {
      // A failed step's screen is the whole page, not the last row's box.
      shot = undefined
      // A row walked before may have grown the screen.
      const size = page.viewportSize()
      if (size?.height !== spec.viewport.height) {
        await page.setViewportSize(spec.viewport)
      }
      const by = Date.now() + DRAWN_MS
      while (queries <= atNavigation) {
        // A query that failed is the reason, not the wait.
        if (problems.length > 0) throw new Error(problems.join("; "))
        if (Date.now() > by) {
          throw new Error(`no panel's query answered in ${String(DRAWN_MS)} ms`)
        }
        await page.waitForTimeout(100)
      }
      await idle()
      // A page that names a row is shot as that row: opened if collapsed,
      // brought to the top of the screen, and drawn there, since Grafana
      // draws only the panels in view.
      const row = rowOf(requested)
      if (row !== undefined) {
        const title = page.locator(rowTitle(row))
        if ((await title.count()) !== 1) {
          throw new Error(`${page.url()} has no row "${row}"`)
        }
        // Grafana keeps its own scroll, so the screen grows down to the row
        // instead, by the walk's height below its title: then the row is in
        // view, and its panels mount and draw.
        const at = await title.boundingBox()
        if (at === null) throw new Error(`the row "${row}" is not on the page`)
        await page.setViewportSize({
          width: spec.viewport.width,
          height: Math.ceil(at.y) + spec.viewport.height,
        })
        const toggle = page.locator(rowToggle(row))
        const collapsed = (await toggle.getAttribute("aria-label")) ?? ""
        if (collapsed.startsWith("Expand row")) await toggle.click()
        // Its panels mount once in view, then draw.
        const by = Date.now() + DRAWN_MS
        while ((await rowBox(page, row)) === undefined) {
          if (Date.now() > by) {
            throw new Error(
              `the row "${row}" showed no panel in ${String(DRAWN_MS)} ms`
            )
          }
          await page.waitForTimeout(100)
        }
        await idle()
        const box = await rowBox(page, row)
        if (box === undefined)
          throw new Error(`the row "${row}" shows no panel`)
        // A row taller than the walk's screen would be cut short, its lower
        // panels never drawn: such a walk needs a taller screen.
        if (box.height > spec.viewport.height) {
          throw new Error(
            `the row "${row}" is ${String(box.height)} px tall, past the walk's ${String(spec.viewport.height)}`
          )
        }
        shot = box
      } else {
        shot = undefined
      }
      // A panel whose series the telemetry lacks draws this, not the panel
      // ("No data" by default, "no data" where a panel sets its own); on a
      // row, only its own panels count.
      const empty = await page.getByText(NO_DATA).all()
      let shown = 0
      for (const text of empty) {
        const box = await text.boundingBox()
        const inShot =
          shot === undefined ||
          (box !== null && box.y >= shot.y && box.y < shot.y + shot.height)
        if (inShot) shown += 1
      }
      const allowed = row === undefined ? 0 : (spec.noData?.[row] ?? 0)
      if (shown > allowed)
        throw new Error(
          `${page.url()} drew no data in ${String(shown)} ${shown === 1 ? "place" : "places"}, past the ${String(allowed)} it may`
        )
      if (spec.band !== undefined) await drawBand(page, spec.band, shot)
    }

    return {
      page,
      version: spec.version,
      get viewport(): WalkViewport {
        return screen.viewport()
      },
      origin,
      place: (x, y) => ({ x, y }),
      open: async (init): Promise<void> => {
        // A stat measures its text on a canvas when it first draws, and
        // keeps that for the page's life; a canvas does not wait for a web
        // font, so one drawn before Grafana's Inter arrived would keep the
        // fallback font's size, by timing. So Grafana's own Inter files are
        // given to every page before its scripts run, already loaded.
        await page.addInitScript({ content: await interFaces(page, origin) })
        for (const content of init) await page.addInitScript({ content })
        await page.goto(`${origin}${spec.page}`)
      },
      settle: drawn,
      shoot: async (path, moving): Promise<void> => {
        screen.took(shot)
        const take = (): Promise<Buffer> =>
          page.screenshot({
            animations: "disabled",
            caret: "hide",
            ...(shot === undefined ? {} : { clip: shot }),
          })
        // A failed walk's last screen is taken as it is.
        if (moving) {
          await writeFile(path, await take())
          return
        }
        // Grafana sizes a stat's text after it draws, a frame or more late:
        // a screen is kept once two in a row are the same, so the same
        // telemetry gives the same bytes, and one that never holds fails.
        const { png, held } = await heldStill(take, STILL_TRIES, STILL_GAP_MS)
        if (!held) {
          throw new Error(
            `${page.url()} was still changing after ${String(STILL_TRIES)} screens`
          )
        }
        await writeFile(path, png)
      },
      problems: (): ReadonlyArray<string> => problems,
      close: () => browser.close(),
    }
  } catch (e) {
    await browser.close()
    throw e
  }
}
