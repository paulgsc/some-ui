/**
 * The Grafana stage (C1072, #3415): home's own Grafana, its panels opened one
 * by one at a fixed size, theme and time range, in a Chromium with nothing
 * else in it. Home's dashboards are walked here (`./home-dashboards`), inside
 * home's render worker, for the public site's server clip and cores still.
 *
 * Every request the page makes for anywhere but Grafana's own origin is
 * refused, and a request to it carries a Viewer service account's token,
 * read from `GRAFANA_TOKEN` in the environment, never from the sample, a
 * file or an argument, and never written anywhere. A script error, or an
 * answer from Grafana that is not a success, fails the walk: a panel that
 * did not draw is not the dashboard.
 */

import type { Page } from "playwright-core"
import { chromium } from "playwright-core"

import type { Stage } from "./run"
import { settlePage } from "./stage-sandbox"

/** The environment variable that holds Grafana's token. */
const GRAFANA_TOKEN = "GRAFANA_TOKEN"

/** How long a panel may take to fetch and draw its data. */
const DRAWN_MS = 30_000

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
  const answer = await page.request.get(`${origin}/api/health`)
  if (!answer.ok()) {
    throw new Error(`Grafana's health answered ${String(answer.status())}`)
  }
}

/**
 * The page drawn: nothing in flight for a while, no panel still loading, and
 * then the sandbox's own settle (fonts, two frames).
 */
async function drawn(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: DRAWN_MS })
  await page
    .locator('[aria-label="Panel loading bar"]')
    .first()
    .waitFor({ state: "detached", timeout: DRAWN_MS })
  await settlePage(page)
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
  const browser = await chromium.launch({ executablePath: chrome })
  try {
    const context = await browser.newContext({
      viewport: spec.viewport,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "UTC",
    })
    const page = await context.newPage()
    const problems: Array<string> = []
    page.on("pageerror", (e) => problems.push(e.message))
    page.on("response", (answer) => {
      const url = new URL(answer.url())
      if (url.origin === origin && answer.status() >= 400) {
        problems.push(`${url.pathname} answered ${String(answer.status())}`)
      }
    })
    // Only Grafana is reached, and only Grafana is given the token.
    await context.route("**/*", async (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        await route.abort("blockedbyclient")
        return
      }
      await route.continue({
        headers: {
          ...route.request().headers(),
          authorization: `Bearer ${token}`,
        },
      })
    })
    await reached(page, origin)
    return {
      page,
      version: spec.version,
      viewport: { ...spec.viewport, scale: 1 },
      place: (x, y) => ({ x, y }),
      open: async (init): Promise<void> => {
        for (const content of init) await page.addInitScript({ content })
        await page.goto(`${origin}${spec.page}`)
      },
      settle: (): Promise<void> => drawn(page),
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
