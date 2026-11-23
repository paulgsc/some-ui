/**
 * The sample telemetry the public site's dashboard walks are drawn on
 * (`./home-dashboards`; the owner on #3401, 2026-11-23: "generate the
 * dashboard with mock telemetry … it's deterministic and automatic"). One
 * week of every series the walked panels query, one sample a minute, written
 * as OpenMetrics for `promtool tsdb create-blocks-from openmetrics`, so a
 * throwaway Prometheus holds it and a throwaway Grafana draws the panels from
 * it. Nothing here is home's: no machine is read, and the same code gives the
 * same bytes, so the same dashboards give the same pictures.
 *
 * The week is a fixed one in the past (`WEEK`), and its shape is chosen to
 * show what the panels are for: file_host restarts twice (deploys), NATS is
 * down once for twenty minutes, a scraper meets the rate limiter one
 * afternoon, and each night a render job takes all four cores, so work
 * queues for them (PSI's CPU waiting) while they are busy. The noise is a
 * seeded generator's, never the clock's or `Math.random`'s.
 *
 * Which series and labels: those the panels' queries read, at
 * paulgsc/server's `infra/grafana/dashboards` (file_host's dashboard 943,
 * 945, 946, 922, 926, 927 and WHO DUNNIT's 32, as `./home-dashboards` names
 * them), with the label values file_host exports (`metrics/refusals.rs`,
 * `metrics/rate_limit.rs`). A panel whose query moves to a series this does
 * not write draws "No data", which the walk's stage refuses.
 */

/** The window the walks show: seven days ending at a UTC midnight long past. */
export const WEEK = { to: "2026-11-16T00:00:00Z", days: 7 } as const

/** One sample a minute, as a scrape every 60 s. */
const STEP_S = 60

/** Samples before the window, so a `rate(…[5m])` at its first instant has some. */
const LEAD_S = 3600

const HOUR_S = 3600
const DAY_S = 86_400

/** A seeded generator (mulberry32): the same seed, the same noise. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Seconds since the epoch of `iso`. */
const at = (iso: string): number => Date.parse(iso) / 1000

/** Whether `t` is in [from, to). */
const within = (t: number, from: string, to: string): boolean =>
  t >= at(from) && t < at(to)

/** file_host's deploys: each a restart, down for the minute it starts in. */
const DEPLOYS = ["2026-11-10T18:30:00Z", "2026-11-13T21:10:00Z"] as const

/** When file_host had last started before the window. */
const STARTED_BEFORE = "2026-11-04T09:12:00Z"

/** NATS down once, for twenty minutes, in the night. */
const NATS_DOWN = ["2026-11-12T03:00:00Z", "2026-11-12T03:20:00Z"] as const

/** A scraper that meets the rate limiter, one afternoon. */
const SCRAPER = ["2026-11-11T14:00:00Z", "2026-11-11T14:40:00Z"] as const

/** The hour of the UTC day `t` falls in, with its fraction. */
const hourOf = (t: number): number => (((t % DAY_S) + DAY_S) % DAY_S) / HOUR_S

/** How busy the day is at `t`, 0 to 1: quiet before dawn, busiest at 20:00. */
const daily = (t: number): number =>
  0.5 + 0.5 * Math.cos((2 * Math.PI * (hourOf(t) - 20)) / 24)

/** The nightly render job, 02:00 to 03:30: every core busy while it runs. */
const rendering = (t: number): boolean => {
  const h = hourOf(t)
  return h >= 2 && h < 3.5
}

/** The nightly backup, 04:00 to 04:20: the disk, not the cores, is the wait. */
const backingUp = (t: number): boolean => {
  const h = hourOf(t)
  return h >= 4 && h < 4 + 20 / 60
}

/** Whether file_host was down at `t`: the minute a deploy restarts it. */
const restarting = (t: number): boolean =>
  DEPLOYS.some((d) => t >= at(d) && t < at(d) + STEP_S)

/** When the running file_host started, as of `t`. */
function startedAt(t: number): number {
  let started = at(STARTED_BEFORE)
  for (const d of DEPLOYS) if (t >= at(d) + STEP_S) started = at(d) + STEP_S
  return started
}

type Labels = Readonly<Record<string, string>>

/** A series: its name, labels, and its value at each instant (a counter's is its running total). */
type Series = {
  readonly name: string
  readonly labels: Labels
  readonly value: (t: number) => number
}

/** A metric family: its OpenMetrics name and type, and its series. */
type Family = {
  readonly name: string
  readonly type: "gauge" | "counter"
  readonly series: ReadonlyArray<Series>
}

/** A gauge of one series. */
const gauge = (
  name: string,
  labels: Labels,
  value: (t: number) => number
): Family => ({ name, type: "gauge", series: [{ name, labels, value }] })

/**
 * A counter from its rate: the running total of `rate(t)` per second over
 * each step, from 0 at the first instant. A rate is read once per instant,
 * in order, so a seeded rate's noise is the same every run.
 */
function counter(
  rate: (t: number) => number,
  times: ReadonlyArray<number>
): (t: number) => number {
  const totals = new Map<number, number>()
  let total = 0
  for (const t of times) {
    totals.set(t, total)
    total += Math.max(0, rate(t)) * STEP_S
  }
  return (t) => totals.get(t) ?? 0
}

/** Every instant the telemetry holds, in order. */
function instants(): ReadonlyArray<number> {
  const to = at(WEEK.to)
  const from = to - WEEK.days * DAY_S - LEAD_S
  const times: Array<number> = []
  for (let t = from; t <= to; t += STEP_S) times.push(t)
  return times
}

/** Every family the walked panels read, over `times`. */
function families(times: ReadonlyArray<number>): ReadonlyArray<Family> {
  const noise = seeded(3401)
  // Each series draws its noise once per instant, in order, as it is built.
  const jitter = (scale: number): ((t: number) => number) => {
    const values = new Map(times.map((t) => [t, (noise() - 0.5) * scale]))
    return (t) => values.get(t) ?? 0
  }

  const fileHostUp = (t: number): number => (restarting(t) ? 0 : 1)
  const natsUp = (t: number): number => (within(t, ...NATS_DOWN) ? 0 : 1)
  const always = (): number => 1

  const allowedJitter = jitter(1.2)
  const rejectedJitter = jitter(0.02)
  const allowed = (t: number): number =>
    1.5 + 7 * daily(t) + allowedJitter(t) + (within(t, ...SCRAPER) ? 9 : 0)
  const rejected = (t: number): number =>
    (within(t, ...SCRAPER) ? 2.6 : 0) + Math.max(0, rejectedJitter(t))

  const shedJitter = jitter(0.08)
  const refusal = (
    stage: "http" | "ws",
    reason: string,
    rate: (t: number) => number
  ): Series => ({
    name: "refusals_total",
    labels: { stage, reason },
    value: counter(rate, times),
  })
  const none = (): number => 0

  const tokensJitter = jitter(4)
  const clientsJitter = jitter(1.5)

  const busyJitter = Array.from({ length: 4 }, () => jitter(0.06))
  const waitJitter = jitter(0.12)
  /** How much of a core's minute it was busy, 0 to 1. */
  const busy = (core: number, t: number): number => {
    const base = rendering(t)
      ? 0.95
      : 0.06 + 0.3 * daily(t) + (within(t, ...SCRAPER) ? 0.25 : 0)
    return Math.min(0.995, Math.max(0.01, base + (busyJitter[core]?.(t) ?? 0)))
  }
  const iowait = (t: number): number => (backingUp(t) ? 0.14 : 0.004)
  /** PSI's "some" CPU waiting: work queued for a core, which a render makes most of. */
  const waiting = (t: number): number =>
    rendering(t)
      ? 0.62 + waitJitter(t)
      : 0.015 + 0.04 * daily(t) + Math.max(0, waitJitter(t)) * 0.1

  const cores = [0, 1, 2, 3]
  const modes = ["idle", "iowait", "system", "user"] as const
  const share = (
    mode: (typeof modes)[number],
    core: number,
    t: number
  ): number => {
    const b = busy(core, t)
    const w = Math.min(iowait(t), 1 - b)
    const shares: Readonly<Record<(typeof modes)[number], number>> = {
      idle: 1 - b - w,
      iowait: w,
      system: b * 0.3,
      user: b * 0.7,
    }
    return shares[mode]
  }

  return [
    {
      name: "up",
      type: "gauge",
      series: [
        { name: "up", labels: { job: "file_host" }, value: fileHostUp },
        { name: "up", labels: { job: "nats" }, value: natsUp },
        { name: "up", labels: { job: "orchestrator" }, value: always },
        { name: "up", labels: { job: "redis" }, value: always },
      ],
    },
    gauge("probe_success", { job: "websocket_blackbox_http" }, fileHostUp),
    gauge("redis_up", { job: "redis" }, always),
    gauge("gnatsd_varz_connections", { job: "nats" }, (t) =>
      natsUp(t) === 1 ? 6 : 0
    ),
    gauge("process_start_time_seconds", { job: "file_host" }, startedAt),
    {
      name: "rate_limit_decisions",
      type: "counter",
      series: [
        {
          name: "rate_limit_decisions_total",
          labels: { limiter: "http", outcome: "allowed" },
          value: counter(allowed, times),
        },
        {
          name: "rate_limit_decisions_total",
          labels: { limiter: "http", outcome: "rejected" },
          value: counter(rejected, times),
        },
      ],
    },
    {
      name: "refusals",
      type: "counter",
      series: [
        refusal("http", "timeout", (t) => (rendering(t) ? 0.05 : 0)),
        refusal("http", "load_shed", (t) =>
          rendering(t) ? 0.35 + shedJitter(t) : 0
        ),
        refusal("http", "body_limit", none),
        refusal("http", "pool_timeout", none),
        refusal("ws", "global_capacity", none),
        refusal("ws", "queue_full", (t) => (rendering(t) ? 0.08 : 0)),
        refusal("ws", "permit_timeout", none),
      ],
    },
    gauge("rate_limit_tokens_available", { job: "file_host" }, (t) =>
      Math.max(
        0,
        within(t, ...SCRAPER)
          ? 3 + Math.abs(tokensJitter(t))
          : 96 - 34 * daily(t) + tokensJitter(t)
      )
    ),
    gauge("rate_limit_active_clients", { job: "file_host" }, (t) =>
      Math.max(
        1,
        Math.round(
          2 + 9 * daily(t) + clientsJitter(t) + (within(t, ...SCRAPER) ? 1 : 0)
        )
      )
    ),
    {
      name: "node_cpu_seconds",
      type: "counter",
      series: cores.flatMap((core) =>
        modes.map((mode) => ({
          name: "node_cpu_seconds_total",
          labels: { cpu: String(core), mode },
          value: counter((t) => share(mode, core, t), times),
        }))
      ),
    },
    {
      name: "node_pressure_cpu_waiting_seconds",
      type: "counter",
      series: [
        {
          name: "node_pressure_cpu_waiting_seconds_total",
          labels: {},
          value: counter(waiting, times),
        },
      ],
    },
  ]
}

/** A label set as OpenMetrics writes it, in its keys' order. */
const labelText = (labels: Labels): string => {
  const pairs = Object.entries(labels).map(([k, v]) => `${k}="${v}"`)
  return pairs.length === 0 ? "" : `{${pairs.join(",")}}`
}

/**
 * The week's telemetry as OpenMetrics text, a line at a time: each family's
 * TYPE, then each of its series in time order, then `# EOF`. Values carry
 * six decimals, so the text is the same on every machine.
 */
export function* openMetrics(): Generator<string> {
  const times = instants()
  for (const family of families(times)) {
    yield `# TYPE ${family.name} ${family.type}\n`
    for (const series of family.series) {
      const head = `${series.name}${labelText(series.labels)} `
      for (const t of times) {
        yield `${head}${series.value(t).toFixed(6)} ${String(t)}\n`
      }
    }
  }
  yield "# EOF\n"
}
