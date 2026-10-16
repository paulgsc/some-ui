import type { MetaData, VeilContent } from "@censor/lib/content/fsm"
import { describe, expect, expectTypeOf, it } from "vitest"

import type { Estimate } from "./maturity"
import { classify, DEFAULT_BOUNDARY_DAYS, estimate } from "./maturity"

const NOW = Date.UTC(2026, 9, 16)

describe("estimate", () => {
  it.each<[string, number]>([
    ["5 seconds ago", 0],
    ["1 hour ago", 0],
    ["Streamed 2 hours ago", 0],
    ["3 days ago", 3],
    ["3 days ago", 3],
    ["1 week ago", 7],
    ["2 weeks ago", 14],
    ["1 month ago", 28],
    ["11 months ago", 308],
    ["1 year ago", 365],
    ["Premiered 3 years ago", 1095],
    ["Streamed live 2 years ago", 730],
    ["6 years ago", 2190],
    // 2024-01-06T12:00Z, the last instant Jan 5 exists anywhere, to NOW.
    ["Jan 5, 2024", 1013],
    ["Premiered on Jan 5, 2024", 1013],
    ["Streamed live on Jan 5, 2024", 1013],
    // Yesterday in some time zone is not yet past everywhere: zero, not future.
    ["Oct 15, 2026", 0],
  ])("reads %j as at least %d days old", (raw, minDays) => {
    expect(estimate(raw, NOW)).toEqual({ kind: "aged", minDays })
  })

  it.each([
    ["LIVE", "live"],
    ["Live now", "live"],
    ["1.2K watching", "live"],
    ["340 watching now", "live"],
    ["Premieres in 3 hours", "upcoming"],
    ["Premieres Oct 20, 2026", "upcoming"],
    ["Scheduled for Oct 20, 2026", "upcoming"],
    ["Upcoming", "upcoming"],
  ] as const)("reads %j as present (%s)", (raw, reason) => {
    expect(estimate(raw, NOW)).toEqual({ kind: "present", reason })
  })

  it("holds everything it cannot read with certainty as unverified", () => {
    const unsupported = [
      null,
      "",
      "1.2M views",
      "No views",
      "Updated today",
      "Members only",
      "il y a 3 jours",
      "vor 3 Tagen",
      "3日前",
      "a day ago",
      "Feb 31, 2024",
      "Foo 5, 2024",
      "3 days",
      "3 days ago · 1.2M views",
    ]
    for (const raw of unsupported) {
      expect(estimate(raw, NOW), String(raw)).toEqual({ kind: "unverified" })
    }
  })

  it("holds an absolute date when the clock is unusable", () => {
    expect(estimate("Jan 5, 2024", Number.NaN)).toEqual({ kind: "unverified" })
  })
})

describe("classify", () => {
  const aged = (minDays: number): Estimate => ({ kind: "aged", minDays })
  const B = DEFAULT_BOUNDARY_DAYS

  it("maps the bands of doctrine §5, boundaries inclusive at the low edge", () => {
    expect(classify({ kind: "unverified" }, B)).toBe("QM0")
    expect(classify({ kind: "present", reason: "live" }, B)).toBe("QM1")
    expect(classify(aged(0), B)).toBe("QM1")
    expect(classify(aged(36), B)).toBe("QM1")
    expect(classify(aged(37), B)).toBe("QM2")
    expect(classify(aged(B - 1), B)).toBe("QM2")
    expect(classify(aged(B), B)).toBe("QM3")
    expect(classify(aged(3 * B - 1), B)).toBe("QM3")
    expect(classify(aged(3 * B), B)).toBe("QM4")
  })

  it("admits a bucket only once its youngest reading has crossed the boundary", () => {
    expect(classify(estimate("11 months ago", NOW), B)).toBe("QM2")
    expect(classify(estimate("1 year ago", NOW), B)).toBe("QM3")
  })
})

describe("the presentable metadata", () => {
  it("cannot carry a raw date into a veil (QD4)", () => {
    expectTypeOf<MetaData>().not.toHaveProperty("uploadDate")
    expectTypeOf<
      Extract<VeilContent, { kind: "meta" }>["meta"]
    >().toEqualTypeOf<MetaData>()
  })
})
