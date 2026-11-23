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
const WHO_DUNNIT = "who-dunnit-forensic"

/** file_host's dashboard, in the order the clip shows it (#3401's list). */
const SERVER_PANELS: ReadonlyArray<Panel> = [
  { dashboard: FILE_HOST, id: 943, label: "Availability" },
  { dashboard: FILE_HOST, id: 945, label: "Up for" },
  { dashboard: FILE_HOST, id: 946, label: "Services, up and down" },
  { dashboard: FILE_HOST, id: 922, label: "Rate limited" },
  { dashboard: FILE_HOST, id: 926, label: "Refusals by reason" },
  { dashboard: FILE_HOST, id: 927, label: "The limiter's tokens" },
]

/** WHO DUNNIT's "CPU — busy vs waiting", of home's four cores. */
const CORES_PANEL: Panel = {
  dashboard: WHO_DUNNIT,
  id: 32,
  label: "CPU, busy against waiting",
}

/** Every panel at one size: the frame a walkthrough draws a screen in, and the card's still. */
const VIEWPORT = { width: 1000, height: 640 } as const

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

function walkOf(
  app: string,
  panels: ReadonlyArray<Panel>,
  sample: Sample
): Walk {
  const [first] = panels
  if (first === undefined) throw new Error(`${app} names no panel`)
  const steps: ReadonlyArray<Step> = panels.map((panel, i) => ({
    label: panel.label,
    action:
      i === 0
        ? { kind: "open" }
        : { kind: "visit", path: panelPath(panel, sample) },
    holdMs: HOLD_MS,
  }))
  return {
    app,
    stage: {
      kind: "grafana",
      version: sample.version,
      origin: sample.origin,
      page: panelPath(first, sample),
      viewport: VIEWPORT,
    },
    steps,
  }
}

export const homeServer = {
  sample: SampleSchema,
  walk: (sample: Sample): Walk => walkOf("home-server", SERVER_PANELS, sample),
}

export const homeCores = {
  sample: SampleSchema,
  walk: (sample: Sample): Walk => walkOf("home-cores", [CORES_PANEL], sample),
}
