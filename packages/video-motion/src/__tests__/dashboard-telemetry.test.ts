import { createHash } from "node:crypto"
import { openMetrics, WEEK } from "@video-motion/walk/dashboard-telemetry"
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
    seen.evenlySpaced &&= t - seen.last === 60
    seen.onlyRises &&= value >= seen.value
    seen.last = t
    seen.value = value
  }
  return { hash: hash.digest("hex"), tail, all }
}

describe("the dashboards' sample telemetry", () => {
  const once = read()

  it("is the same text every time, and ends as OpenMetrics does", () => {
    expect(read().hash).toBe(once.hash)
    expect(once.tail).toBe("# EOF\n")
  })

  it("writes every series the walked rows query (paulgsc/server's jsonnet)", () => {
    const names = new Set(Array.from(once.all.keys(), (k) => k.split("{")[0]))
    for (const name of [
      "up",
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
    ]) {
      expect(names).toContain(name)
    }
    expect(
      Array.from(once.all.keys()).filter(
        (k) =>
          k.startsWith("node_cpu_seconds_total") && k.includes('mode="idle"')
      )
    ).toHaveLength(4)
  })

  it("covers the sample week, a minute apart, and every counter only rises", () => {
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
})
