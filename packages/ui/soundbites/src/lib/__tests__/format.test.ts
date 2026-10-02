import {
  describeContext,
  formatDuration,
  formatWhen,
} from "@soundbites/lib/format"
import { describe, expect, it } from "vitest"

describe("formatDuration", () => {
  it("reads as minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(7_400)).toBe("0:07")
    expect(formatDuration(60_000)).toBe("1:00")
    expect(formatDuration(-5)).toBe("0:00")
  })
})

describe("formatWhen", () => {
  const now = new Date(2026, 9, 1, 21, 30)

  it("names today and yesterday, then the weekday, then the date", () => {
    expect(formatWhen(new Date(2026, 9, 1, 9, 5).toISOString(), now)).toMatch(
      /^Today /
    )
    expect(formatWhen(new Date(2026, 8, 30, 23).toISOString(), now)).toMatch(
      /^Yesterday /
    )
    expect(formatWhen(new Date(2026, 8, 27, 8).toISOString(), now)).not.toMatch(
      /^(Today|Yesterday) /
    )
    expect(formatWhen(new Date(2026, 8, 1, 8).toISOString(), now)).toMatch(/,/)
  })
})

describe("describeContext", () => {
  const recordedAt = "2026-10-04T12:00:00.000Z"

  it("says what the app noted, in plain words", () => {
    expect(
      describeContext(
        {
          source: "reminder",
          lastSessionAt: "2026-10-01T09:00:00.000Z",
          openSessions: 2,
          timeZone: "UTC",
        },
        recordedAt
      )
    ).toBe("From a reminder · 3 days since a session · 2 open")
  })

  it("covers no sessions at all, and one the same day", () => {
    const base = { source: "direct", openSessions: 0, timeZone: "UTC" } as const
    expect(describeContext({ ...base, lastSessionAt: null }, recordedAt)).toBe(
      "No sessions yet"
    )
    expect(
      describeContext(
        { ...base, lastSessionAt: "2026-10-04T08:00:00.000Z" },
        recordedAt
      )
    ).toBe("Under a day since a session")
    expect(
      describeContext(
        { ...base, lastSessionAt: "2026-10-03T08:00:00.000Z" },
        recordedAt
      )
    ).toBe("1 day since a session")
  })
})
