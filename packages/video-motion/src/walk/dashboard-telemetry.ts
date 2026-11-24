/**
 * The sample telemetry the public site's dashboard walks are drawn on
 * (`./home-dashboards`; the owner on #3401, 2026-11-23: "generate the
 * dashboard with mock telemetry … it's deterministic and automatic"). One
 * week of every series the walked rows and panels query, one sample a
 * minute, written as OpenMetrics for `promtool tsdb create-blocks-from
 * openmetrics`, so a throwaway Prometheus holds it and a throwaway Grafana
 * draws the dashboards from it. Nothing here is home's: no machine is read,
 * and the same code gives the same bytes, so the same dashboards give the
 * same pictures.
 *
 * The week is a fixed one in the past (`WEEK`), and it tells one story, so a
 * row's colours say what a real decision would turn on (the owner,
 * 2026-11-24: "the holistic combination in colour gives you one decision"):
 *
 * - each night from 23:20 to 00:50 a render job takes every core: work
 *   queues for them (PSI's CPU waiting), file_host's p95 latency crosses
 *   its orange line, it sheds load, the render lane pauses interactive
 *   work's rivals, and the transcriber's oldest note waits past its
 *   promise. The window ends inside one such night, so the rows' stats
 *   show it as it happens;
 * - file_host restarts twice (deploys), NATS is down for twenty minutes one
 *   night, a scraper meets the rate limiter one afternoon, and ESPN stops
 *   answering for most of an hour one morning;
 * - a backup each night at 04:00 makes the disk, not the cores, the wait.
 *
 * The noise is the repo's one seeded draw (`unitIntervalBySeed`,
 * `@some-ui/core-utils`), keyed by series and instant, never the clock's or
 * `Math.random`'s.
 *
 * Which series and labels: those the walked rows' queries read, at
 * paulgsc/server's `infra/grafana/dashboards` (file_host's dashboard, OUTBOUND
 * and CALL, as `./home-dashboards` names them), with the label values the
 * server exports (`metrics/refusals.rs`, `metrics/rate_limit.rs`,
 * `crates/outbound`, `metrics/contention.rs`, `call_weeks/lane.rs`). A panel whose query moves to a
 * series this does not write draws "No data", which the walk's stage
 * refuses.
 */

import { fnv1a, unitIntervalBySeed } from "@some-ui/core-utils"

/** The window the walks show: seven days ending at a UTC midnight long past. */
export const WEEK = { to: "2026-11-16T00:00:00Z", days: 7 } as const

/** One sample a minute, as a scrape every 60 s. */
const STEP_S = 60

/**
 * The series a `rate(…[1m])` reads (Rate limiting's invariant), sampled
 * every 15 s, so a minute holds the two samples a rate needs.
 */
export const FINE: {
  readonly step: number
  readonly names: ReadonlySet<string>
} = {
  step: 15,
  names: new Set(["http_requests_total", "rate_limit_decisions_total"]),
}

/** How often a series is sampled. */
const stepOf = (name: string): number =>
  FINE.names.has(name) ? FINE.step : STEP_S

/** Samples before the window, so a `rate(…[15m])` at its first instant has some. */
const LEAD_S = 3600

const HOUR_S = 3600
const DAY_S = 86_400

/** Seconds since the epoch of `iso`. */
const at = (iso: string): number => Date.parse(iso) / 1000

/** Whether `t` is in [from, to). */
const within = (t: number, [from, to]: readonly [string, string]): boolean =>
  t >= at(from) && t < at(to)

/** file_host's deploys: each a restart, down for the minute it starts in. */
const DEPLOYS = ["2026-11-10T18:30:00Z", "2026-11-13T21:10:00Z"] as const

/** When file_host had last started before the window. */
const STARTED_BEFORE = "2026-11-04T09:12:00Z"

/** NATS down once, for twenty minutes, in the night. */
const NATS_DOWN = ["2026-11-12T03:00:00Z", "2026-11-12T03:20:00Z"] as const

/** A scraper that meets the rate limiter, one afternoon. */
const SCRAPER = ["2026-11-11T14:00:00Z", "2026-11-11T14:40:00Z"] as const

/** ESPN stops answering the game feed for most of an hour, one morning. */
const ESPN_DOWN = ["2026-11-10T09:00:00Z", "2026-11-10T09:50:00Z"] as const

/** The mailbox Worker misses a few answers late on the last evening. */
const MAILBOX_SLOW = ["2026-11-15T22:00:00Z", "2026-11-15T22:20:00Z"] as const

/**
 * The weeks home makes into videos (CALL's rows; the "it didn't run" essay,
 * #3476): the weekly call is given and rendered on Sunday evening, last
 * week's Rust Rounds and mock interview essays on Monday morning, and this
 * week's of each is held from midweek and still waiting for its deadline as
 * the window ends, on a Monday, with nothing refused, failed or failing.
 * Each is one job's turn, `[given, rendered]`, and the moment this week's
 * essay was held.
 */
const CALL_RENDER = ["2026-11-15T17:05:00Z", "2026-11-15T17:45:00Z"] as const
const RUST_RENDER = ["2026-11-09T06:00:00Z", "2026-11-09T06:40:00Z"] as const
const RUST_HELD = "2026-11-10T12:00:00Z"
const INTERVIEW_RENDER = [
  "2026-11-09T07:00:00Z",
  "2026-11-09T07:30:00Z",
] as const
const INTERVIEW_HELD = "2026-11-11T09:00:00Z"

/** The hour of the UTC day `t` falls in, with its fraction. */
const hourOf = (t: number): number => (((t % DAY_S) + DAY_S) % DAY_S) / HOUR_S

/** How busy the day is at `t`, 0 to 1: quiet before dawn, busiest at 20:00. */
const daily = (t: number): number =>
  0.5 + 0.5 * Math.cos((2 * Math.PI * (hourOf(t) - 20)) / 24)

/** Whether `t` falls between two hours of its night, which may cross midnight. */
const between = (t: number, from: number, to: number): boolean => {
  const h = hourOf(t)
  return from <= to ? h >= from && h < to : h >= from || h < to
}

/** The night's render job, named to the lane from 23:15 until it ends at 00:50. */
const jobNamed = (t: number): boolean => between(t, 23.25, 50 / 60)

/** Which night's job `t` belongs to: a job is its own from the night it is named. */
const jobOf = (t: number): number => Math.floor((t + 2 * HOUR_S) / DAY_S)

/** I'm using the app for ten minutes after the render starts: interactive work waits. */
const interactiveAt = (t: number): boolean =>
  between(t, 23 + 25 / 60, 23 + 35 / 60)

/** Memory pressure rises past the lane's limit for six minutes each night. */
const pressureSpike = (t: number): boolean =>
  between(t, 23 + 40 / 60, 23 + 46 / 60)

/**
 * The render lane's policy, as file_host sets it for the call's render
 * (paulgsc/server `file_host::call_weeks::lane`).
 */
const LANE_POLICY = {
  floorBytes: 2 * 1024 ** 3,
  pressureLimitPct: 10,
  holdDownMs: 30_000,
  peakBytes: 3 * 1024 ** 3,
} as const

type Verb = "run" | "pause" | "stop"
type Why = "clear" | "busy" | "memory" | "pressure" | "unknown" | "settling"
type LaneState = {
  readonly verb: Verb
  readonly why: Why
  readonly stops: number
  readonly job: number | undefined
  readonly roomSinceMs: number | undefined
}
type LaneSignals = {
  readonly nowMs: number
  readonly job: number | undefined
  readonly interactive: boolean
  readonly memAvailable: number
  readonly pressurePct: number
}

/**
 * One tick of the render lane, as paulgsc/server's `crates/lane` decides it
 * (`step`, rules LA2 to LA4), so the sample shows only what the lane can
 * say: a shortage stops batch work and counts a stop of the job in
 * progress; a start needs room for its peak; interactive work pauses it;
 * after a stop, room must hold for the hold-down, settling, before it runs.
 */
function laneStep(state: LaneState, s: LaneSignals): LaneState {
  const continuing = s.job !== undefined && s.job === state.job
  let stops = continuing ? state.stops : 0
  const shortage: Why | undefined =
    s.memAvailable < LANE_POLICY.floorBytes
      ? "memory"
      : s.pressurePct > LANE_POLICY.pressureLimitPct
        ? "pressure"
        : undefined
  const room = s.memAvailable >= LANE_POLICY.peakBytes + LANE_POLICY.floorBytes
  let verb: Verb
  let why: Why
  let roomSinceMs: number | undefined
  if (state.verb !== "stop") {
    if (shortage !== undefined) [verb, why] = ["stop", shortage]
    else if (!room && !continuing) [verb, why] = ["stop", "memory"]
    else if (s.interactive) [verb, why] = ["pause", "busy"]
    else [verb, why] = ["run", "clear"]
  } else if (s.interactive) [verb, why] = ["stop", "busy"]
  else if (shortage !== undefined) [verb, why] = ["stop", shortage]
  else if (!room) [verb, why] = ["stop", "memory"]
  else if (
    state.roomSinceMs !== undefined &&
    s.nowMs - state.roomSinceMs >= LANE_POLICY.holdDownMs
  ) {
    ;[verb, why] = ["run", "clear"]
  } else {
    ;[verb, why, roomSinceMs] = [
      "stop",
      "settling",
      state.roomSinceMs ?? s.nowMs,
    ]
  }
  if (
    state.verb !== "stop" &&
    verb === "stop" &&
    s.job !== undefined &&
    (why === "memory" || why === "pressure")
  ) {
    stops += 1
  }
  return { verb, why, stops, job: s.job, roomSinceMs }
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

/** A series' noise at an instant, from a seed keyed by both, in [-scale/2, scale/2). */
const noise =
  (key: string, scale: number): ((t: number) => number) =>
  (t) =>
    (unitIntervalBySeed(fnv1a(`${key}@${String(t)}`)) - 0.5) * scale

const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x))

const GIB = 1024 ** 3

type Labels = Readonly<Record<string, string>>

/**
 * A series: a gauge's value at each instant, or a counter's rate per second,
 * which `openMetrics` sums into its running total from 0.
 */
type Series = {
  readonly name: string
  readonly labels: Labels
  readonly kind: "gauge" | "counter"
  readonly at: (t: number) => number
}

const gauge = (
  name: string,
  labels: Labels,
  value: (t: number) => number
): Series => ({ name, labels, kind: "gauge", at: value })

const counter = (
  name: string,
  labels: Labels,
  rate: (t: number) => number
): Series => ({ name, labels, kind: "counter", at: rate })

/** A histogram's upper bounds, in seconds. */
const LE = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] as const

/**
 * A histogram's buckets for requests at `rate` a second whose 95th
 * percentile is `p95` seconds: an exponential spread with that quantile,
 * as each bucket's cumulative counter.
 */
function buckets(
  name: string,
  labels: Labels,
  rate: (t: number) => number,
  p95: (t: number) => number
): ReadonlyArray<Series> {
  const share = (le: number, t: number): number =>
    1 - Math.exp((-Math.log(20) * le) / Math.max(1e-3, p95(t)))
  return [
    ...LE.map((le) =>
      counter(
        name,
        { ...labels, le: String(le) },
        (t) => rate(t) * share(le, t)
      )
    ),
    counter(name, { ...labels, le: "+Inf" }, rate),
  ]
}

/** file_host's routes, each a share of its traffic and its p95 when nothing holds the box. */
const ROUTES = [
  { route: "/api/sessions", share: 0.45, p95: 0.06 },
  { route: "/api/jobs/digest", share: 0.25, p95: 0.12 },
  { route: "/api/signals", share: 0.2, p95: 0.03 },
  { route: "/ws", share: 0.1, p95: 0.02 },
] as const

/** Whom file_host calls (`crates/outbound`), each with its host and pace a minute. */
const CALLERS = [
  { caller: "game_feed", host: "espn", perMin: 4, p95: 0.8, bytes: 60_000 },
  {
    caller: "mailbox",
    host: "mailbox_worker",
    perMin: 6,
    p95: 0.35,
    bytes: 4000,
  },
  { caller: "nudge", host: "web_push", perMin: 1.5, p95: 0.25, bytes: 800 },
  { caller: "snips", host: "github_api", perMin: 0.4, p95: 0.6, bytes: 25_000 },
] as const

/** The services the Metal row reads, by container and by process group. */
const SERVICES = [
  {
    name: "file-host-server",
    group: "file_host",
    cores: 2,
    memGiB: 2,
    base: 0.35,
    mem: 0.55,
  },
  {
    name: "orchestrator-service",
    group: "orchestrator",
    cores: 1,
    memGiB: 1,
    base: 0.12,
    mem: 0.38,
  },
  {
    name: "some-redis",
    group: "redis-server",
    cores: 0.5,
    memGiB: 0.5,
    base: 0.08,
    mem: 0.62,
  },
  {
    name: "nats-server",
    group: "nats-server",
    cores: 0.5,
    memGiB: 0.25,
    base: 0.05,
    mem: 0.3,
  },
] as const

/** Every series the walked rows read, over the week. */
function allSeries(): ReadonlyArray<Series> {
  const up = (t: number): number => (restarting(t) ? 0 : 1)
  const natsUp = (t: number): number => (within(t, NATS_DOWN) ? 0 : 1)
  const one = (): number => 1
  const zero = (): number => 0
  const scraper = (t: number): boolean => within(t, SCRAPER)

  // The render lane, tick by tick over the week (a tick a minute here), and
  // what it reads: free memory (less the render's while it holds it) and
  // memory pressure.
  const memBase = (t: number): number =>
    (9.5 - 2 * daily(t)) * GIB + noise("memfree", 0.3)(t) * GIB
  const pressureAt = (t: number, held: boolean): number =>
    pressureSpike(t)
      ? 14 + noise("psi", 3)(t)
      : held
        ? 5 + noise("psi", 3)(t)
        : 1.5 + Math.max(0, noise("psi", 2)(t))
  const lane = new Map<number, LaneState & { mem: number; pressure: number }>()
  {
    let state: LaneState = {
      verb: "run",
      why: "clear",
      stops: 0,
      job: undefined,
      roomSinceMs: undefined,
    }
    for (const t of instants(STEP_S)) {
      const job = jobNamed(t) ? jobOf(t) : undefined
      // The render holds its memory while it runs or is paused, not once stopped.
      const held =
        job !== undefined && state.job === job && state.verb !== "stop"
      const mem = memBase(t) - (held ? LANE_POLICY.peakBytes : 0)
      const pressure = pressureAt(t, held)
      state = laneStep(state, {
        nowMs: t * 1000,
        job,
        interactive: interactiveAt(t),
        memAvailable: mem,
        pressurePct: pressure,
      })
      lane.set(t, { ...state, mem, pressure })
    }
  }
  /** The lane at `t`'s minute. */
  const laneAt = (t: number): LaneState & { mem: number; pressure: number } => {
    const found = lane.get(t - (((t % STEP_S) + STEP_S) % STEP_S))
    if (found === undefined) throw new Error(`no lane tick for ${String(t)}`)
    return found
  }
  /** The render is on the cores: its job named, and the lane saying run. */
  const rendering = (t: number): boolean =>
    jobNamed(t) && laneAt(t).verb === "run"

  // file_host's traffic: requests a second, and how slow while the render holds the box.
  const traffic = (t: number): number =>
    1.2 + 6 * daily(t) + noise("traffic", 0.8)(t) + (scraper(t) ? 9 : 0)
  const slowdown = (t: number): number =>
    rendering(t)
      ? 6 + noise("slow", 1.5)(t)
      : 1 + Math.max(0, noise("slow", 0.4)(t))
  const shed = (t: number): number =>
    rendering(t) ? 0.35 + noise("shed", 0.1)(t) : 0
  const rejected = (t: number): number =>
    (scraper(t) ? 2.6 : 0) + Math.max(0, noise("rejected", 0.004)(t))

  // The cores: how busy each is, and work queued for them.
  const busy = (core: number, t: number): number =>
    clamp(
      (rendering(t) ? 0.95 : 0.06 + 0.3 * daily(t) + (scraper(t) ? 0.25 : 0)) +
        noise(`busy-${String(core)}`, 0.06)(t),
      0.01,
      0.995
    )
  const iowait = (t: number): number => (backingUp(t) ? 0.14 : 0.004)
  const waiting = (t: number): number =>
    rendering(t)
      ? 0.62 + noise("wait", 0.12)(t)
      : 0.015 + 0.04 * daily(t) + Math.max(0, noise("wait", 0.12)(t)) * 0.1
  const cpuShare = (mode: string, core: number, t: number): number => {
    const b = busy(core, t)
    const w = Math.min(iowait(t), 1 - b)
    const shares: Readonly<Record<string, number>> = {
      idle: 1 - b - w,
      iowait: w,
      system: b * 0.3,
      user: b * 0.7,
    }
    return shares[mode] ?? 0
  }

  // The transcriber's queue: notes waiting, and the oldest's wait, which the render holds up.
  const waitingNotes = (t: number): number =>
    jobNamed(t)
      ? 7
      : Math.max(0, Math.round(1 + 2 * daily(t) + noise("notes", 2)(t)))
  const oldestWait = (t: number): number => {
    const h = hourOf(t)
    const sinceNamed = (h >= 23.25 ? h - 23.25 : h + 0.75) * HOUR_S
    return jobNamed(t)
      ? 300 + sinceNamed
      : 90 + Math.max(0, noise("oldest", 120)(t))
  }

  const series: Array<Series> = [
    // Is it up: scrapes, probes, dependencies, restarts.
    gauge("up", { job: "file_host" }, up),
    gauge("up", { job: "nats" }, natsUp),
    gauge("up", { job: "orchestrator" }, one),
    gauge("up", { job: "redis" }, one),
    gauge("probe_success", { job: "websocket_blackbox_http" }, up),
    gauge("redis_up", { job: "redis" }, one),
    gauge("gnatsd_varz_connections", { job: "nats" }, (t) =>
      natsUp(t) === 1 ? 6 : 0
    ),
    gauge("process_start_time_seconds", { job: "file_host" }, startedAt),
    gauge(
      "service_info",
      { job: "file_host", git_sha: "sample", built_at: "sample" },
      one
    ),
    ...["sqlite", "schema", "redis"].map((dependency) =>
      gauge("dependency_up", { dependency }, one)
    ),
    gauge("dependency_up", { dependency: "nats" }, natsUp),
    // The nudge waker, passing every minute.
    gauge("nudge_waker_enabled", {}, one),
    gauge("nudge_waker_interval_seconds", {}, () => 60),
    gauge("nudge_waker_last_attempt_timestamp_seconds", {}, (t) => t - 20),
    gauge("nudge_waker_pass_failing", { error: "none" }, zero),
    // Traffic, latency and errors.
    ...ROUTES.flatMap(({ route, share, p95 }) => [
      counter(
        "http_requests_total",
        { route, status: "200" },
        (t) => traffic(t) * share * 0.96 - shed(t) * share
      ),
      counter(
        "http_requests_total",
        { route, status: "404" },
        (t) => traffic(t) * share * 0.03
      ),
      counter(
        "http_requests_total",
        { route, status: "429" },
        (t) => rejected(t) * share
      ),
      counter("http_requests_total", { route, status: "500" }, (t) =>
        restarting(t) || within(t, NATS_DOWN) ? 0.2 * share : 0
      ),
      ...buckets(
        "http_request_duration_seconds_bucket",
        { route },
        (t) => traffic(t) * share,
        (t) => p95 * slowdown(t)
      ),
    ]),
    counter(
      "http_requests_total",
      { route: "/ready", status: "200" },
      () => 1 / 15
    ),
    counter(
      "tracing_events_total",
      { level: "error", target: "file_host::nats" },
      (t) => (within(t, NATS_DOWN) ? 0.05 : 0)
    ),
    counter(
      "tracing_events_total",
      { level: "error", target: "file_host::render" },
      (t) => (laneAt(t).why === "pressure" ? 0.004 : 0)
    ),
    counter(
      "tracing_events_total",
      { level: "error", target: "outbound::espn" },
      (t) => (within(t, ESPN_DOWN) ? 0.03 : 0)
    ),
    // Refusals and the limiter.
    counter("refusals_total", { stage: "http", reason: "load_shed" }, shed),
    counter("refusals_total", { stage: "http", reason: "timeout" }, (t) =>
      rendering(t) ? 0.05 : 0
    ),
    counter("refusals_total", { stage: "http", reason: "body_limit" }, zero),
    counter("refusals_total", { stage: "http", reason: "pool_timeout" }, zero),
    counter("refusals_total", { stage: "ws", reason: "global_capacity" }, zero),
    counter("refusals_total", { stage: "ws", reason: "queue_full" }, (t) =>
      rendering(t) ? 0.08 : 0
    ),
    counter("refusals_total", { stage: "ws", reason: "permit_timeout" }, zero),
    counter(
      "rate_limit_decisions_total",
      { limiter: "http", outcome: "allowed" },
      traffic
    ),
    counter(
      "rate_limit_decisions_total",
      { limiter: "http", outcome: "rejected" },
      rejected
    ),
    gauge("rate_limit_tokens_available", { job: "file_host" }, (t) =>
      Math.max(
        0,
        scraper(t)
          ? 3 + Math.abs(noise("tokens", 4)(t))
          : 96 - 34 * daily(t) + noise("tokens", 4)(t)
      )
    ),
    gauge("rate_limit_active_clients", { job: "file_host" }, (t) =>
      Math.max(
        1,
        Math.round(
          2 + 9 * daily(t) + noise("clients", 1.5)(t) + (scraper(t) ? 1 : 0)
        )
      )
    ),
    gauge("rate_limit_capacity_per_minute", {}, () => 600),
    // Realtime: who is connected, and how they talk.
    gauge("ws_client_connections", { client_type: "phone" }, (t) =>
      Math.round(1 + 2 * daily(t))
    ),
    gauge("ws_client_connections", { client_type: "desktop" }, (t) =>
      daily(t) > 0.4 ? 1 : 0
    ),
    gauge("ws_client_connections", { client_type: "probe" }, one),
    gauge("ws_connections", { state: "connected" }, (t) =>
      Math.round(2 + 2 * daily(t) + (daily(t) > 0.4 ? 1 : 0))
    ),
    gauge("ws_connection_guard_occupancy", {}, (t) =>
      Math.round(2 + 2 * daily(t) + (daily(t) > 0.4 ? 1 : 0))
    ),
    gauge("ws_connection_guard_capacity", {}, () => 32),
    counter(
      "ws_connection_messages_total",
      { message_type: "event" },
      (t) => 0.5 + 3 * daily(t)
    ),
    counter(
      "ws_connection_messages_total",
      { message_type: "ping" },
      () => 0.2
    ),
    counter(
      "ws_connection_messages_total",
      { message_type: "subscribe" },
      (t) => 0.02 + 0.05 * daily(t)
    ),
    counter(
      "ws_connection_errors_total",
      { error_type: "queue_full", phase: "send" },
      (t) => (rendering(t) ? 0.08 : 0)
    ),
    counter(
      "ws_connection_errors_total",
      { error_type: "closed", phase: "read" },
      (t) => (restarting(t) ? 0.3 : 0.001)
    ),
    // Shared stages: the transcriber, and what waits on it.
    counter(
      "stage_attempts_total",
      { stage: "transcriber", result: "done" },
      (t) => (rendering(t) ? 0.001 : 0.01 + 0.02 * daily(t))
    ),
    counter(
      "stage_attempts_total",
      { stage: "transcriber", result: "retry" },
      (t) => (rendering(t) ? 0.002 : 0)
    ),
    gauge("stage_attempts_per_item", { stage: "transcriber" }, () => 3),
    gauge("stage_waiting", { stage: "transcriber" }, waitingNotes),
    gauge("stage:oldest_waiting:seconds", { stage: "transcriber" }, oldestWait),
    gauge("stage_promise_seconds", { stage: "transcriber" }, () => 900),
    gauge("cards_essays_waiting_on_takes", {}, (t) => (rendering(t) ? 2 : 0)),
    // The render lane, as `laneStep` decided each tick.
    gauge("lane_last_decision_timestamp_seconds", {}, (t) => t - 5),
    gauge("lane_stops", {}, (t) => laneAt(t).stops),
    gauge("lane_signal_readable", {}, one),
    ...(["run", "pause", "stop"] as const).map((v) =>
      gauge("lane_verb", { verb: v }, (t) => (laneAt(t).verb === v ? 1 : 0))
    ),
    ...(
      ["clear", "busy", "memory", "pressure", "unknown", "settling"] as const
    ).map((w) =>
      gauge("lane_why", { why: w }, (t) => (laneAt(t).why === w ? 1 : 0))
    ),
    // A tick every 5 s, counted under what it decided.
    ...(
      [
        ["run", "clear"],
        ["pause", "busy"],
        ["stop", "busy"],
        ["stop", "memory"],
        ["stop", "pressure"],
        ["stop", "settling"],
      ] as const
    ).map(([v, w]) =>
      counter("lane_ticks_total", { verb: v, why: w }, (t) =>
        laneAt(t).verb === v && laneAt(t).why === w ? 0.2 : 0
      )
    ),
    // The kinds file_host's lane names (`call_weeks::lane::Kind`): hearing a
    // note, recording a Rust Rounds program.
    counter("lane_busy_ticks_total", { kind: "voice" }, (t) =>
      jobNamed(t) ? 0.12 : 0.02 * daily(t)
    ),
    counter("lane_busy_ticks_total", { kind: "rust_rounds" }, (t) =>
      interactiveAt(t) ? 0.2 : 0.03 * daily(t)
    ),
    gauge("lane_interactive_waiting", {}, (t) => (interactiveAt(t) ? 1 : 0)),
    gauge("lane_batch_active", {}, (t) => (rendering(t) ? 1 : 0)),
    gauge("lane_batch_job_present", {}, (t) => (jobNamed(t) ? 1 : 0)),
    gauge("lane_idle", {}, (t) =>
      jobNamed(t) || interactiveAt(t) ? 0 : daily(t) < 0.2 ? 1 : 0
    ),
    gauge("lane_mem_available_bytes", {}, (t) => laneAt(t).mem),
    gauge("lane_floor_bytes", {}, () => LANE_POLICY.floorBytes),
    gauge("lane_batch_peak_bytes", {}, () => LANE_POLICY.peakBytes),
    gauge("lane_declared_peak_bytes", {}, () => 4 * GIB),
    gauge("lane_memory_pressure_pct", {}, (t) => laneAt(t).pressure),
    gauge("lane_pressure_limit_pct", {}, () => LANE_POLICY.pressureLimitPct),
    counter(
      "contention_outcomes_total",
      { worker: "render", what: "excused" },
      (t) => (rendering(t) ? 0.01 : 0)
    ),
    counter(
      "contention_outcomes_total",
      { worker: "render", what: "judged_anyway" },
      (t) => (rendering(t) ? 0.002 : 0)
    ),
    counter(
      "contention_outcomes_total",
      { worker: "transcriber", what: "marked" },
      (t) => (rendering(t) ? 0.004 : 0)
    ),
    counter(
      "contention_outcomes_total",
      { worker: "transcriber", what: "unreadable" },
      // Rare, but not never: a bar of no length is drawn unevenly, by a pixel.
      (t) => (laneAt(t).why === "settling" ? 0.02 : 0)
    ),
    // The metal: each service against its own limits, and the disks.
    ...SERVICES.flatMap(({ name, group, cores, memGiB, base, mem }) => [
      counter(
        "container_cpu_usage_seconds_total",
        { name },
        (t) =>
          cores *
          clamp(
            base *
              (0.6 + daily(t)) *
              (rendering(t) && group === "file_host" ? 2.4 : 1) +
              noise(`cpu-${name}`, 0.04)(t),
            0.005,
            0.99
          )
      ),
      gauge("container_spec_cpu_quota", { name }, () => cores * 100_000),
      gauge("container_spec_cpu_period", { name }, () => 100_000),
      gauge(
        "container_memory_working_set_bytes",
        { name },
        (t) =>
          memGiB *
          GIB *
          clamp(
            mem +
              0.1 * daily(t) +
              (rendering(t) && group === "file_host" ? 0.22 : 0) +
              noise(`mem-${name}`, 0.02)(t),
            0.05,
            0.99
          )
      ),
      gauge("container_spec_memory_limit_bytes", { name }, () => memGiB * GIB),
      counter(
        "namedprocess_namegroup_read_bytes_total",
        { groupname: group },
        (t) =>
          (backingUp(t) ? 40 : 1) *
          (group === "file_host" ? 900_000 : 120_000) *
          (0.5 + daily(t))
      ),
      counter(
        "namedprocess_namegroup_write_bytes_total",
        { groupname: group },
        (t) =>
          (group === "redis-server" && backingUp(t) ? 20 : 1) *
          (group === "file_host" ? 400_000 : 60_000) *
          (0.5 + daily(t))
      ),
      counter(
        "container_network_receive_bytes_total",
        { name },
        (t) => (group === "file_host" ? 180_000 : 20_000) * (0.4 + daily(t))
      ),
      counter(
        "container_network_transmit_bytes_total",
        { name },
        (t) => (group === "file_host" ? 420_000 : 15_000) * (0.4 + daily(t))
      ),
    ]),
    gauge(
      "node_filesystem_size_bytes",
      { mountpoint: "/", fstype: "ext4" },
      () => 460 * GIB
    ),
    gauge(
      "node_filesystem_avail_bytes",
      { mountpoint: "/", fstype: "ext4" },
      (t) => (125 - ((t - at(WEEK.to)) / DAY_S) * -0.4) * GIB
    ),
    gauge(
      "node_filesystem_size_bytes",
      { mountpoint: "/srv/media", fstype: "ext4" },
      () => 916 * GIB
    ),
    gauge(
      "node_filesystem_avail_bytes",
      { mountpoint: "/srv/media", fstype: "ext4" },
      () => 140 * GIB
    ),
    // Outbound: whom file_host asks, and whether they answered.
    ...CALLERS.flatMap(({ caller, host, perMin, p95, bytes }) => {
      const down = (t: number): boolean =>
        (caller === "game_feed" && within(t, ESPN_DOWN)) ||
        (caller === "mailbox" && within(t, MAILBOX_SLOW))
      const rate = (t: number): number => (perMin / 60) * (0.6 + 0.8 * daily(t))
      return [
        counter(
          "outbound_requests_total",
          { caller, host, outcome: "ok" },
          (t) => (down(t) ? rate(t) * 0.2 : rate(t))
        ),
        counter(
          "outbound_requests_total",
          {
            caller,
            host,
            outcome: caller === "game_feed" ? "timeout" : "no_answer",
          },
          (t) => (down(t) ? rate(t) * 0.8 : 0)
        ),
        counter(
          "outbound_requests_total",
          { caller, host, outcome: "refused_5xx" },
          (t) =>
            caller === "nudge" && hourOf(t) >= 12 && hourOf(t) < 12.1
              ? rate(t)
              : 0
        ),
        ...buckets(
          "outbound_request_duration_seconds_bucket",
          { caller },
          rate,
          (t) =>
            down(t)
              ? caller === "game_feed"
                ? 18
                : 6
              : p95 * (1 + Math.max(0, noise(`ob-${caller}`, 0.3)(t)))
        ),
        counter("outbound_sent_bytes_total", { caller }, (t) => rate(t) * 600),
        counter("outbound_received_bytes_total", { caller }, (t) =>
          down(t) ? rate(t) * bytes * 0.2 : rate(t) * bytes
        ),
      ]
    }),
    // The cores: busy, waiting and iowait, as WHO DUNNIT reads them.
    ...[0, 1, 2, 3].flatMap((core) =>
      ["idle", "iowait", "system", "user"].map((mode) =>
        counter("node_cpu_seconds_total", { cpu: String(core), mode }, (t) =>
          cpuShare(mode, core, t)
        )
      )
    ),
    counter("node_pressure_cpu_waiting_seconds_total", {}, waiting),
    ...weekJobs(),
  ]
  return series
}

/**
 * The gauges CALL's rows read for the jobs that make weeks into videos
 * (paulgsc/server `metrics/call_weeks.rs`, `metrics/rust_essays.rs`): each
 * job's worker passes every minute and home's keeper every five, so every
 * "since" stat is fresh, and only the essays waiting for their deadline say
 * this Monday's are not made yet.
 */
function weekJobs(): ReadonlyArray<Series> {
  const minute = (t: number): number => t - (((t % 60) + 60) % 60)
  const fiveMinutes = (t: number): number => t - (((t % 300) + 300) % 300)
  const zero = (): number => 0
  /** One job's turn: given once, waiting for its video until rendered. */
  type Turn = Readonly<
    Record<"given" | "waiting" | "taken", (t: number) => number>
  >
  const turn = ([given, rendered]: readonly [string, string]): Turn => ({
    given: (t: number): number => (t >= at(given) ? 1 : 0),
    waiting: (t: number): number => (within(t, [given, rendered]) ? 1 : 0),
    taken: (t: number): number =>
      within(t, [given, rendered]) ? at(given) : 0,
  })
  const call = turn(CALL_RENDER)
  const rust = turn(RUST_RENDER)
  const interview = turn(INTERVIEW_RENDER)
  const held =
    (from: string) =>
    (t: number): number =>
      t >= at(from) ? 1 : 0
  return [
    gauge("call_weeks_held", {}, (t) => 1 + call.given(t)),
    gauge("call_weeks_last_attempt_timestamp_seconds", {}, fiveMinutes),
    gauge("call_weeks_pass_failing", {}, zero),
    gauge("call_render_weeks_waiting", {}, call.waiting),
    gauge("call_render_weeks_failed", {}, zero),
    gauge("call_render_weeks_let_go", {}, zero),
    gauge("call_render_oldest_waiting_taken_timestamp_seconds", {}, call.taken),
    gauge("call_render_worker_last_pass_timestamp_seconds", {}, minute),
    gauge("rust_essays_waiting_for_deadline", {}, held(RUST_HELD)),
    gauge("rust_essays_refused", {}, zero),
    gauge("rust_essays_pass_failing", {}, zero),
    gauge("rust_essay_render_given", {}, rust.given),
    gauge("rust_essay_render_waiting", {}, rust.waiting),
    gauge("rust_essay_render_failed", {}, zero),
    gauge(
      "rust_essay_render_oldest_waiting_taken_timestamp_seconds",
      {},
      rust.taken
    ),
    gauge("rust_essay_render_worker_last_pass_timestamp_seconds", {}, minute),
    gauge("interview_essays_waiting_for_deadline", {}, held(INTERVIEW_HELD)),
    gauge("interview_essays_refused", {}, zero),
    gauge("interview_essays_pass_failing", {}, zero),
    gauge("interview_essay_render_given", {}, interview.given),
    gauge("interview_essay_render_waiting", {}, interview.waiting),
    gauge("interview_essay_render_failed", {}, zero),
    gauge(
      "interview_essay_render_oldest_waiting_taken_timestamp_seconds",
      {},
      interview.taken
    ),
    gauge(
      "interview_essay_render_worker_last_pass_timestamp_seconds",
      {},
      minute
    ),
  ]
}

/** Every instant the telemetry holds, in order. */
function instants(step: number): ReadonlyArray<number> {
  const to = at(WEEK.to)
  const from = to - WEEK.days * DAY_S - LEAD_S
  const times: Array<number> = []
  for (let t = from; t <= to; t += step) times.push(t)
  return times
}

/** A label set as OpenMetrics writes it, in its keys' order. */
const labelText = (labels: Labels): string => {
  const pairs = Object.entries(labels).map(([k, v]) => `${k}="${v}"`)
  return pairs.length === 0 ? "" : `{${pairs.join(",")}}`
}

/**
 * A series' metric family: a counter's name less `_total`, anything else's
 * own name, as `unknown` (a histogram's buckets are written as counters of
 * their own, which no query here tells apart).
 */
function familyOf(s: Series): { readonly name: string; readonly type: string } {
  if (s.kind === "counter" && s.name.endsWith("_total")) {
    return { name: s.name.slice(0, -"_total".length), type: "counter" }
  }
  return { name: s.name, type: s.kind === "gauge" ? "gauge" : "unknown" }
}

/**
 * The week's telemetry as OpenMetrics text, a line at a time: each family's
 * TYPE, then each of its series in time order, then `# EOF`. A counter's
 * total is its rate summed over each step; a rate below zero, or not a
 * number, throws. Values carry six
 * decimals, so the text is the same on every machine.
 */
export function* openMetrics(): Generator<string> {
  const coarse = instants(STEP_S)
  const fine = instants(FINE.step)
  const byFamily = new Map<string, { type: string; series: Array<Series> }>()
  for (const s of allSeries()) {
    const { name, type } = familyOf(s)
    const family = byFamily.get(name) ?? { type, series: [] }
    family.series.push(s)
    byFamily.set(name, family)
  }
  for (const [name, { type, series }] of byFamily) {
    yield `# TYPE ${name} ${type}\n`
    for (const s of series) {
      const head = `${s.name}${labelText(s.labels)} `
      let total = 0
      const step = stepOf(s.name)
      for (const t of step === FINE.step ? fine : coarse) {
        const value = s.kind === "gauge" ? s.at(t) : total
        yield `${head}${value.toFixed(6)} ${String(t)}\n`
        if (s.kind === "counter") {
          const rate = s.at(t)
          // A counter never falls: a rate below zero is this module's mistake.
          if (!(rate >= 0)) {
            throw new Error(
              `${s.name}${labelText(s.labels)} has rate ${String(rate)} at ${String(t)}`
            )
          }
          total += rate * step
        }
      }
    }
  }
  yield "# EOF\n"
}
