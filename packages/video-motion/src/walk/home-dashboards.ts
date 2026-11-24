/**
 * The server's dashboards for the public site (the owner on #3401,
 * 2026-11-23, which moves C1071 and C1073): two walks on a throwaway Grafana
 * (`./stage-grafana`) that a Site Assets job starts on GitHub, serving the
 * dashboards compiled from paulgsc/server's jsonnet over a throwaway
 * Prometheus that holds one week of sample telemetry
 * (`./dashboard-telemetry`). Each panel is opened alone (`/d-solo/`) at one
 * size, in the dark theme, over that week. The server episode's faces are the
 * first walk's walkthrough (`home-server`), the cores gap's still the second
 * walk's one screen (`home-cores`). Home is never reached, and no number in
 * them is home's.
 *
 * Which panels: the owner's (#3401: "the server through its Grafana
 * dashboards", "the 4 CPU cores"). A panel is named here by its dashboard's
 * uid and its id in that dashboard's jsonnet (paulgsc/server
 * infra/grafana/dashboards), so a panel that moves is a change here, in
 * review.
 *
 * Deterministic framing: the sample week (`WEEK`), the stage's size and
 * theme, and UTC. The same dashboards over the same telemetry give the same
 * pictures.
 */

import { z } from "zod"

import { WEEK } from "./dashboard-telemetry"
import type { Step, Walk } from "./run"
import type { GrafanaStageSpec } from "./stage-grafana"
import { ROW_PARAM } from "./stage-grafana"

/** What the Site Assets job writes for the walks: the sample week, and where its Grafana answers. */
const SampleSchema = z.strictObject({
  schema: z.literal("some-ui.walk-sample/home-dashboards/2"),
  /** The server commit the dashboards were built from, as build metadata (`0.0.0+<sha>`). */
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  /** The throwaway Grafana, as the walk reaches it. */
  origin: z.url({ protocol: /^https?$/ }),
  /** The window's end and length: the week the telemetry holds, and no other. */
  to: z.literal(WEEK.to),
  days: z.literal(WEEK.days),
})
type Sample = z.infer<typeof SampleSchema>

/** One panel: its dashboard's uid, its id there, its title as the walk labels it. */
type Panel = {
  readonly dashboard: string
  readonly id: number
  readonly label: string
}

const FILE_HOST = "file-host-dashboard"
const OUTBOUND = "outbound"
const CALL = "call"
const WHO_DUNNIT = "who-dunnit-forensic"

/**
 * One of the server episode's scenes: a grouping, a row of one of the
 * dashboards, by its dashboard's uid and its title in that dashboard's
 * jsonnet, shot whole for a wide screen; and the two panels of it a phone
 * shows instead (the owner, 2026-11-24: "the holistic combination in colour
 * gives you one decision, not one pane … keep the current single-panel
 * snaps on mobile").
 */
type Grouping = {
  readonly dashboard: string
  readonly row: string
  readonly label: string
  readonly panels: readonly [Panel, Panel]
}

/**
 * The server episode's groupings, a scene each: every grouping the owner
 * named, its pool (the show draws four a visit; the first four are the
 * draw a reader without a script sees).
 */
export const SERVER_GROUPINGS: ReadonlyArray<Grouping> = [
  {
    dashboard: FILE_HOST,
    row: "file_host",
    label: "Is it up and well",
    panels: [
      { dashboard: FILE_HOST, id: 943, label: "Availability" },
      { dashboard: FILE_HOST, id: 945, label: "Up for" },
    ],
  },
  {
    dashboard: FILE_HOST,
    row: "Traffic, latency & errors",
    label: "Traffic, latency and errors",
    panels: [
      { dashboard: FILE_HOST, id: 909, label: "Latency by route" },
      { dashboard: FILE_HOST, id: 908, label: "Requests by outcome" },
    ],
  },
  {
    dashboard: OUTBOUND,
    row: "What file_host asks the outside",
    label: "What it asks the outside",
    panels: [
      { dashboard: OUTBOUND, id: 7, label: "Requests, by caller" },
      { dashboard: OUTBOUND, id: 4, label: "Not OK, 24 hours" },
    ],
  },
  {
    dashboard: CALL,
    row: "LANE: when the render may run",
    label: "When the render may run",
    panels: [
      { dashboard: CALL, id: 35, label: "Free memory against a render" },
      { dashboard: CALL, id: 36, label: "Memory pressure" },
    ],
  },
  {
    dashboard: FILE_HOST,
    row: "Shared stages: what other work waits on",
    label: "What other work waits on",
    panels: [
      { dashboard: FILE_HOST, id: 971, label: "The transcriber" },
      { dashboard: FILE_HOST, id: 973, label: "Who waits on it" },
    ],
  },
  {
    dashboard: FILE_HOST,
    row: "Metal — what the services cost the host",
    label: "What the services cost the host",
    panels: [
      { dashboard: FILE_HOST, id: 947, label: "CPU, against each limit" },
      { dashboard: FILE_HOST, id: 948, label: "Memory, against each limit" },
    ],
  },
  {
    dashboard: FILE_HOST,
    row: "Realtime — WebSocket",
    label: "Who is connected",
    panels: [
      { dashboard: FILE_HOST, id: 918, label: "Connections against capacity" },
      { dashboard: FILE_HOST, id: 920, label: "Messages, by kind" },
    ],
  },
  {
    dashboard: FILE_HOST,
    row: "Rate limiting & refusals",
    label: "Saying no, and why",
    panels: [
      { dashboard: FILE_HOST, id: 926, label: "Refusals by reason" },
      { dashboard: FILE_HOST, id: 927, label: "The limiter's tokens" },
    ],
  },
]

/** WHO DUNNIT's "CPU — busy vs waiting", of home's four cores. */
const CORES_PANEL: Panel = {
  dashboard: WHO_DUNNIT,
  id: 32,
  label: "CPU, busy against waiting",
}

/** Every panel at one size: the frame a walkthrough draws a screen in, and the card's still. */
const VIEWPORT = { width: 1000, height: 640 } as const

/**
 * A row's screen: wide enough that a row of six stats keeps every title and
 * number legible, tall enough to hold the tallest walked row whole.
 */
const ROW_VIEWPORT = { width: 1440, height: 1600 } as const

/** How long each panel holds in the clip. */
const HOLD_MS = 2400

/** A panel alone, over the sample's window, dark, in UTC. */
export function panelPath(panel: Panel, sample: Sample): string {
  const to = Date.parse(sample.to)
  const from = to - sample.days * 86_400_000
  const query = new URLSearchParams({
    orgId: "1",
    panelId: String(panel.id),
    from: String(from),
    to: String(to),
    theme: "dark",
    timezone: "utc",
  })
  return `/d-solo/${panel.dashboard}/?${query.toString()}`
}

/**
 * A grouping's row, on its whole dashboard over the sample's window, dark,
 * in UTC, with no refresh, in kiosk (no menus; a bare `kiosk`, as Grafana
 * reads it), naming the row so the stage shoots only that row (`ROW_PARAM`,
 * `./stage-grafana`).
 */
export function rowPath(
  grouping: Pick<Grouping, "dashboard" | "row">,
  sample: Sample
): string {
  const to = Date.parse(sample.to)
  const from = to - sample.days * 86_400_000
  const query = new URLSearchParams({
    orgId: "1",
    from: String(from),
    to: String(to),
    theme: "dark",
    timezone: "utc",
    refresh: "",
    [ROW_PARAM]: grouping.row,
  })
  return `/d/${grouping.dashboard}/?${query.toString()}&kiosk`
}

/** A walk of pages, one screen each, at one size, with what its stage draws over them. */
function walkOf(
  app: string,
  pages: ReadonlyArray<{ readonly label: string; readonly path: string }>,
  sample: Sample,
  viewport: { readonly width: number; readonly height: number },
  over: Pick<GrafanaStageSpec, "band" | "noData"> = {}
): Walk {
  const [first] = pages
  if (first === undefined) throw new Error(`${app} names no page`)
  const steps: ReadonlyArray<Step> = pages.map((page, i) => ({
    label: page.label,
    action: i === 0 ? { kind: "open" } : { kind: "visit", path: page.path },
    holdMs: HOLD_MS,
  }))
  return {
    app,
    stage: {
      kind: "grafana",
      version: sample.version,
      origin: sample.origin,
      page: first.path,
      viewport,
      ...over,
    },
    steps,
  }
}

const panelPages = (
  panels: ReadonlyArray<Panel>,
  sample: Sample
): ReadonlyArray<{ readonly label: string; readonly path: string }> =>
  panels.map((panel) => ({
    label: panel.label,
    path: panelPath(panel, sample),
  }))

/** The server episode on a phone: each grouping's two panels, in order. */
export const homeServer = {
  sample: SampleSchema,
  walk: (sample: Sample): Walk =>
    walkOf(
      "home-server",
      panelPages(
        SERVER_GROUPINGS.flatMap((g) => g.panels),
        sample
      ),
      sample,
      VIEWPORT
    ),
}

/** The server episode on a wide screen: each grouping's whole row, in order. */
export const homeServerRows = {
  sample: SampleSchema,
  walk: (sample: Sample): Walk =>
    walkOf(
      "home-server-rows",
      SERVER_GROUPINGS.map((g) => ({
        label: g.label,
        path: rowPath(g, sample),
      })),
      sample,
      ROW_VIEWPORT
    ),
}

export const homeCores = {
  sample: SampleSchema,
  walk: (sample: Sample): Walk =>
    walkOf("home-cores", panelPages([CORES_PANEL], sample), sample, VIEWPORT),
}

/**
 * What a screen an essay shows says over itself (#3476): an essay shows a
 * walk's screen on its own, with none of the landing's words around it, so
 * a made-up Monday must never read as home's.
 */
export const SAMPLE_BAND = "Sample data: a made-up week, not home's"

/**
 * The rows of CALL an essay shows (the "it didn't run" essay, #3476): each
 * week made into a video, then the Rust Rounds and mock interview essays,
 * by their titles in paulgsc/server's `call.jsonnet`.
 */
const CALL_ROWS: ReadonlyArray<Pick<Grouping, "dashboard" | "row" | "label">> =
  [
    {
      dashboard: CALL,
      row: "Each week made into a video",
      label: "Each week made into a video",
    },
    {
      dashboard: CALL,
      row: "Rust Rounds essays, the fourth job",
      label: "Rust Rounds essays",
    },
    {
      dashboard: CALL,
      row: "Mock interview essays, the seventh job",
      label: "Mock interview essays",
    },
  ]

/** The weekly call's dashboard, a row a screen, for an essay. */
export const homeCall = {
  sample: SampleSchema,
  walk: (sample: Sample): Walk =>
    walkOf(
      "home-call",
      CALL_ROWS.map((row) => ({
        label: row.label,
        path: rowPath(row, sample),
      })),
      sample,
      ROW_VIEWPORT,
      // The Rust Rounds row's longest wait, with nothing waiting.
      { band: SAMPLE_BAND, noData: 1 }
    ),
}

const PIPELINES = "pipelines"

/**
 * PIPELINES' graphs, by their ids in paulgsc/server's `pipelines.jsonnet`
 * (each pipeline of `lib/pipelines.json` in order, from 1). With no alert
 * in the sample, every step of ours is green.
 */
const PIPELINE_PANELS: ReadonlyArray<Panel> = [
  { dashboard: PIPELINES, id: 1, label: "The weekly call, step by step" },
  { dashboard: PIPELINES, id: 2, label: "The engagement report, step by step" },
]

/** A pipeline's graph, wide enough for its steps' names. */
const GRAPH_VIEWPORT = { width: 1440, height: 810 } as const

/** The pipelines' graphs, a graph a screen, for an essay. */
export const homePipelines = {
  sample: SampleSchema,
  walk: (sample: Sample): Walk =>
    walkOf(
      "home-pipelines",
      panelPages(PIPELINE_PANELS, sample),
      sample,
      GRAPH_VIEWPORT,
      { band: SAMPLE_BAND }
    ),
}
