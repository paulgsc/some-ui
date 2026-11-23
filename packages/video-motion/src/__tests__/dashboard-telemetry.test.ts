import { openMetrics, WEEK } from "@video-motion/walk/dashboard-telemetry"
import { describe, expect, it } from "vitest"

const text = (): string => Array.from(openMetrics()).join("")

/** Each series' samples, by its name and labels, as [value, time] pairs. */
function series(om: string): Map<string, Array<[number, number]>> {
  const all = new Map<string, Array<[number, number]>>()
  for (const line of om.split("\n")) {
    if (line === "" || line.startsWith("#")) continue
    const at = line.lastIndexOf(" ")
    const before = line.lastIndexOf(" ", at - 1)
    const key = line.slice(0, before)
    const list = all.get(key) ?? []
    list.push([Number(line.slice(before + 1, at)), Number(line.slice(at + 1))])
    all.set(key, list)
  }
  return all
}

describe("the dashboards' sample telemetry", () => {
  const om = text()
  const all = series(om)

  it("is the same text every time, and ends as OpenMetrics does", () => {
    expect(text()).toBe(om)
    expect(om.endsWith("# EOF\n")).toBe(true)
  })

  it("writes every series the walked panels query (paulgsc/server's jsonnet)", () => {
    const names = new Set(Array.from(all.keys(), (k) => k.split("{")[0]))
    for (const name of [
      "up",
      "probe_success",
      "redis_up",
      "gnatsd_varz_connections",
      "process_start_time_seconds",
      "rate_limit_decisions_total",
      "refusals_total",
      "rate_limit_tokens_available",
      "rate_limit_active_clients",
      "node_cpu_seconds_total",
      "node_pressure_cpu_waiting_seconds_total",
    ]) {
      expect(names).toContain(name)
    }
    expect(all.has('up{job="file_host"}')).toBe(true)
    expect(
      all.has('rate_limit_decisions_total{limiter="http",outcome="rejected"}')
    ).toBe(true)
    expect(
      Array.from(all.keys()).filter(
        (k) =>
          k.startsWith("node_cpu_seconds_total") && k.includes('mode="idle"')
      )
    ).toHaveLength(4)
  })

  it("covers the sample week, a minute apart, in order, and every counter only rises", () => {
    const to = Date.parse(WEEK.to) / 1000
    const from = to - WEEK.days * 86_400
    for (const [key, samples] of all) {
      const times = samples.map(([, t]) => t)
      expect(times[0]).toBeLessThan(from)
      expect(times.at(-1)).toBe(to)
      expect(
        times.every((t, i) => i === 0 || t - (times[i - 1] ?? 0) === 60)
      ).toBe(true)
      if (key.split("{")[0]?.endsWith("_total")) {
        expect(
          samples.every(([v], i) => i === 0 || v >= (samples[i - 1]?.[0] ?? 0))
        ).toBe(true)
      }
    }
  })
})
