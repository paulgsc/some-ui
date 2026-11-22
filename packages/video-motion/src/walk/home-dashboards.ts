/**
 * Home's dashboards for the public site (C1073, #3415): two walks on home's
 * own Grafana (`./stage-grafana`), each panel opened alone (`/d-solo/`) at
 * one size, in the dark theme, over one window of time that the sample
 * names. Home's render worker walks them; the server card's clip is the
 * first walk's walkthrough (`home-server`), the cores card's still the
 * second walk's one screen (`home-cores`).
 *
 * Which panels go public is the owner's (#3401: "the server through its
 * Grafana dashboards", "the 4 CPU cores"; #3415's yes). Each is an
 * aggregate: rates, shares, counts and uptime, never a client, an address
 * or a subject (paulgsc/server docs/identity.md). A panel is named here by
 * its dashboard's uid and its id in that dashboard's jsonnet
 * (paulgsc/server infra/grafana/dashboards), so a panel that moves is a
 * change here, in review.
 *
 * Deterministic framing: the sample's window (`to`, a UTC midnight, and
 * `days` before it), the stage's size and theme, and UTC. The same window
 * over the same data gives the same pictures.
 */

import { z } from "zod"

import type { Step, Walk } from "./run"

/** What home writes for the render worker (`site_shots` in paulgsc/server). */
const SampleSchema = z.strictObject({
  schema: z.literal("some-ui.walk-sample/home-dashboards/1"),
  /** file_host's version, as it says it: the walk names what it shows. */
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  /** Grafana, as the render worker reaches it. */
  origin: z.url({ protocol: /^https?$/ }),
  /** The window's end: a UTC midnight that has passed, so its data is all in. */
  to: z.iso
    .datetime()
    .refine((at) => at.endsWith("T00:00:00Z"), "to must be a UTC midnight")
    .refine((at) => Date.parse(at) <= Date.now(), "to must have passed"),
  /** How many days the window holds, ending at `to`: a week, as the words say. */
  days: z.literal(7),
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
