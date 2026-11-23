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
import type { Stage } from "./run"
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
      document.fonts.add(face)
    }
  })()`
}

export async function openGrafanaStage(
  spec: GrafanaStageSpec,
  chrome: string
): Promise<Stage> {
  const origin = new URL(spec.origin).origin
  const browser = await chromium.launch({ executablePath: chrome })
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

    /** A panel's query answered since the page navigated, then the page still. */
    const drawn = async (): Promise<void> => {
      const by = Date.now() + DRAWN_MS
      while (queries <= atNavigation) {
        // A query that failed is the reason, not the wait.
        if (problems.length > 0) throw new Error(problems.join("; "))
        if (Date.now() > by) {
          throw new Error(`no panel's query answered in ${String(DRAWN_MS)} ms`)
        }
        await page.waitForTimeout(100)
      }
      await page.waitForLoadState("networkidle", { timeout: DRAWN_MS })
      await page
        .locator('[aria-label="Panel loading bar"]')
        .first()
        .waitFor({ state: "detached", timeout: DRAWN_MS })
      await settlePage(page)
      // A panel whose series the telemetry lacks draws this, not the panel
      // ("No data" by default, "no data" where a panel sets its own).
      if ((await page.getByText(NO_DATA).count()) > 0) {
        throw new Error(`${page.url()} drew no data`)
      }
    }

    return {
      page,
      version: spec.version,
      viewport: { ...spec.viewport, scale: 1 },
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
        const take = (): Promise<Buffer> =>
          page.screenshot({ animations: "disabled", caret: "hide" })
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
