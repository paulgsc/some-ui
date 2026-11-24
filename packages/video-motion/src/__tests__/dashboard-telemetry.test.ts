import { createHash } from "node:crypto"
import { FINE, openMetrics, WEEK } from "@video-motion/walk/dashboard-telemetry"
import { describe, expect, it } from "vitest"

/** What the test learns of each series, line by line. */
type Seen = {
  first: number
  last: number
  value: number
  evenlySpaced: boolean
  onlyRises: boolean
}

/** The telemetry read once, as it streams: its hash, its end, and each series. */
function read(): { hash: string; tail: string; all: Map<string, Seen> } {
  const hash = createHash("sha256")
  const all = new Map<string, Seen>()
  let tail = ""
  for (const line of openMetrics()) {
    hash.update(line)
    tail = line
    if (line.startsWith("#")) continue
    const at = line.lastIndexOf(" ")
    const before = line.lastIndexOf(" ", at - 1)
    const key = line.slice(0, before)
    const value = Number(line.slice(before + 1, at))
    const t = Number(line.slice(at + 1))
    const seen = all.get(key)
    if (seen === undefined) {
      all.set(key, {
        first: t,
        last: t,
        value,
        evenlySpaced: true,
        onlyRises: true,
      })
      continue
    }
    const step = FINE.names.has(key.split("{")[0] ?? "") ? FINE.step : 60
    seen.evenlySpaced &&= t - seen.last === step
    seen.onlyRises &&= value >= seen.value
    seen.last = t
    seen.value = value
  }
  return { hash: hash.digest("hex"), tail, all }
}

/**
 * A read streams about 2.8 million lines: a couple of seconds here, more
 * than ten on a busy CI runner, so these tests take two minutes' budget.
 */
const READ_BUDGET_MS = 120_000

describe(
  "the dashboards' sample telemetry",
  { timeout: READ_BUDGET_MS },
  () => {
    const once = read()

    it("is the same text every time, and ends as OpenMetrics does", () => {
      expect(read().hash).toBe(once.hash)
      expect(once.tail).toBe("# EOF\n")
    })

    it("writes every series the walked rows query (paulgsc/server's jsonnet)", () => {
      const names = new Set(Array.from(once.all.keys(), (k) => k.split("{")[0]))
      for (const name of [
        "up",
        "probe_success",
        "redis_up",
        "gnatsd_varz_connections",
        "process_start_time_seconds",
        "nudge_waker_enabled",
        "nudge_waker_interval_seconds",
        "nudge_waker_last_attempt_timestamp_seconds",
        "ws_client_connections",
        "ws_connection_guard_occupancy",
        "rate_limit_tokens_available",
        "rate_limit_capacity_per_minute",
        "dependency_up",
        "http_requests_total",
        "http_request_duration_seconds_bucket",
        "refusals_total",
        "tracing_events_total",
        "stage:oldest_waiting:seconds",
        "nudge_waker_pass_failing",
        "outbound_requests_total",
        "outbound_request_duration_seconds_bucket",
        "lane_ticks_total",
        "lane_mem_available_bytes",
        "contention_outcomes_total",
        "container_cpu_usage_seconds_total",
        "node_cpu_seconds_total",
        "node_pressure_cpu_waiting_seconds_total",
        // CALL's rows an essay walks (#3476).
        "call_weeks_held",
        "call_render_weeks_waiting",
        "call_render_worker_last_pass_timestamp_seconds",
        "rust_essays_waiting_for_deadline",
        "rust_essay_render_given",
        "rust_essay_render_worker_last_pass_timestamp_seconds",
        "interview_essays_waiting_for_deadline",
        "interview_essay_render_given",
      ]) {
        expect(names).toContain(name)
      }
      // The label sets the walked rows' queries select by.
      for (const key of [
        'up{job="file_host"}',
        'dependency_up{dependency="sqlite"}',
        'refusals_total{stage="http",reason="load_shed"}',
        'rate_limit_decisions_total{limiter="http",outcome="rejected"}',
        'stage:oldest_waiting:seconds{stage="transcriber"}',
        'lane_verb{verb="stop"}',
        'lane_why{why="pressure"}',
        'lane_ticks_total{verb="stop",why="pressure"}',
        'outbound_requests_total{caller="mailbox",host="mailbox_worker",outcome="no_answer"}',
      ]) {
        expect(once.all.has(key), key).toBe(true)
      }
      expect(
        Array.from(once.all.keys()).filter(
          (k) =>
            k.startsWith("node_cpu_seconds_total") && k.includes('mode="idle"')
        )
      ).toHaveLength(4)
    })

    // WALK11: a label the server's closed enum names, and only those, so a
    // legend reads as home's would (file_host `call_weeks::lane::Kind`).
    it("names the lane's busy kinds as file_host does: voice and rust_rounds", () => {
      const kinds = Array.from(once.all.keys())
        .filter((k) => k.startsWith("lane_busy_ticks_total{"))
        .map((k) => /kind="([^"]+)"/.exec(k)?.[1])
      expect(kinds.sort()).toEqual(["rust_rounds", "voice"])
    })

    it("ends on a Monday with this week's essays waiting for their deadline and nothing failed (#3476)", () => {
      const last = (name: string): number | undefined =>
        once.all.get(name)?.value
      expect(new Date(WEEK.to).getUTCDay()).toBe(1)
      for (const job of ["rust_essays", "interview_essays"]) {
        expect(last(`${job}_waiting_for_deadline`)).toBe(1)
        expect(last(`${job}_refused`)).toBe(0)
        expect(last(`${job}_pass_failing`)).toBe(0)
      }
      for (const job of ["rust_essay", "interview_essay", "call"]) {
        const render = job === "call" ? "call_render_weeks" : `${job}_render`
        expect(last(`${render}_failed`)).toBe(0)
        expect(last(`${render}_waiting`)).toBe(0)
        // Its worker passed in the window's last minute.
        expect(
          Date.parse(WEEK.to) / 1000 -
            (last(
              `${job === "call" ? "call_render" : `${job}_render`}_worker_last_pass_timestamp_seconds`
            ) ?? 0)
        ).toBeLessThanOrEqual(60)
      }
    })

    it("gives every histogram cumulative buckets: no bucket holds more than the next larger one", () => {
      const families = new Map<string, Array<{ le: number; value: number }>>()
      for (const [key, seen] of once.all) {
        const le = /le="([^"]+)"/.exec(key)?.[1]
        if (le === undefined) continue
        const family = key.replace(/,?le="[^"]+"/, "")
        const list = families.get(family) ?? []
        list.push({
          le: le === "+Inf" ? Number.POSITIVE_INFINITY : Number(le),
          value: seen.value,
        })
        families.set(family, list)
      }
      expect(families.size).toBeGreaterThan(0)
      for (const [family, list] of families) {
        const sorted = [...list].sort((a, b) => a.le - b.le)
        for (let i = 1; i < sorted.length; i += 1) {
          expect(sorted[i]?.value ?? 0, family).toBeGreaterThanOrEqual(
            sorted[i - 1]?.value ?? 0
          )
        }
      }
    })

    it("covers the sample week, evenly spaced, and every counter only rises", () => {
      const to = Date.parse(WEEK.to) / 1000
      const from = to - WEEK.days * 86_400
      for (const [key, seen] of once.all) {
        expect(seen.first, key).toBeLessThan(from)
        expect(seen.last, key).toBe(to)
        expect(seen.evenlySpaced, key).toBe(true)
        if (/_total\b|_bucket\b/.test(key.split("{")[0] ?? "")) {
          expect(seen.onlyRises, key).toBe(true)
        }
      }
    })
  }
)
