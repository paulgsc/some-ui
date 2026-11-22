/**
 * The Grafana stage (C1073, #3415): home's own Grafana, its panels opened one
 * by one at a fixed size, theme and time range, in a Chromium with nothing
 * else in it. Home's dashboards are walked here (`./home-dashboards`), inside
 * home's render worker, for the public site's server clip and cores still.
 *
 * Only Grafana is reached, and only Grafana is given the token:
 *
 * - The token is a Viewer service account's, read from `GRAFANA_TOKEN` in
 *   the environment, never from the sample, a file or an argument, and the
 *   browser is started without it in its own environment.
 * - Every request is fetched here, never by the browser: one for another
 *   origin is refused, one to Grafana goes with the token and follows no
 *   redirect, and a redirect it answers is refused and fails the walk (a
 *   redirect to another host would otherwise carry the token, and one to
 *   the login page would be photographed).
 * - Service workers are blocked and every WebSocket closed: neither passes
 *   through the routes above.
 *
 * A script error, or an answer from Grafana that is not a success, fails the
 * walk: a panel that did not draw is not the dashboard. A screen is taken
 * once, after the page's last navigation, a panel's query has answered,
 * nothing is in flight, no panel is loading, and the fonts and two frames
 * are drawn.
 */

import type { Page, Request } from "playwright-core"
import { chromium } from "playwright-core"

import type { Stage } from "./run"
import { settlePage } from "./stage-sandbox"

/** The environment variable that holds Grafana's token. */
const GRAFANA_TOKEN = "GRAFANA_TOKEN"

/** How long a panel may take to fetch and draw its data. */
const DRAWN_MS = 30_000

/** Grafana's query endpoint: a panel has its data once one answers. */
const QUERY = "/api/ds/query"

export type GrafanaStageSpec = {
  readonly kind: "grafana"
  /** The version of what the dashboards show (file_host's), which the walk names. */
  readonly version: string
  /** Grafana, as the walk reaches it (`http://grafana:3000` inside home's render worker). */
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

/** The browser's environment: the walk's, less the token. */
function withoutToken(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (name !== GRAFANA_TOKEN && value !== undefined) env[name] = value
  }
  return env
}

export async function openGrafanaStage(
  spec: GrafanaStageSpec,
  chrome: string
): Promise<Stage> {
  const token = process.env[GRAFANA_TOKEN]
  if (token === undefined || token === "") {
    throw new Error(
      `${GRAFANA_TOKEN} is not set: the walk needs Grafana's token`
    )
  }
  const origin = new URL(spec.origin).origin
  const browser = await chromium.launch({
    executablePath: chrome,
    env: withoutToken(),
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
        const answer = await route.fetch({
          headers: { ...request.headers(), authorization: `Bearer ${token}` },
          maxRedirects: 0,
        })
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
    }

    return {
      page,
      version: spec.version,
      viewport: { ...spec.viewport, scale: 1 },
      origin,
      place: (x, y) => ({ x, y }),
      open: async (init): Promise<void> => {
        for (const content of init) await page.addInitScript({ content })
        await page.goto(`${origin}${spec.page}`)
      },
      settle: drawn,
      shoot: async (path): Promise<void> => {
        await page.screenshot({ path, animations: "disabled", caret: "hide" })
      },
      problems: (): ReadonlyArray<string> => problems,
      close: () => browser.close(),
    }
  } catch (e) {
    await browser.close()
    throw e
  }
}
