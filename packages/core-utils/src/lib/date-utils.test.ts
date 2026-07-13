import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatRelativeTime } from "./date-utils"

const FIXED_NOW = new Date("2024-06-15T12:00:00.000Z")

function secondsAgo(n: number): Date {
  return new Date(FIXED_NOW.getTime() - n * 1000)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("formatRelativeTime - second/minute/hour/day/week/year boundaries", () => {
  it.each([
    ["4s ago -> just now (below the 5s floor)", secondsAgo(4), "just now"],
    ["5s ago -> crosses into seconds-ago", secondsAgo(5), "5 seconds ago"],
    ["59s ago -> still seconds-ago", secondsAgo(59), "59 seconds ago"],
    [
      "60s ago -> crosses into minutes-ago (singular)",
      secondsAgo(60),
      "1 minute ago",
    ],
    ["120s ago -> minutes-ago (plural)", secondsAgo(120), "2 minutes ago"],
    ["59 min ago -> still minutes-ago", secondsAgo(59 * 60), "59 minutes ago"],
    [
      "60 min ago -> crosses into hours-ago (singular)",
      secondsAgo(60 * 60),
      "1 hour ago",
    ],
    [
      "2 hours ago -> hours-ago (plural)",
      secondsAgo(2 * 60 * 60),
      "2 hours ago",
    ],
    [
      "23 hours ago -> still hours-ago",
      secondsAgo(23 * 60 * 60),
      "23 hours ago",
    ],
    [
      "24 hours ago -> crosses into days-ago (singular)",
      secondsAgo(24 * 60 * 60),
      "1 day ago",
    ],
    [
      "3 days ago -> days-ago (plural)",
      secondsAgo(3 * 24 * 60 * 60),
      "3 days ago",
    ],
    [
      "7 days ago -> still days-ago (upper bound)",
      secondsAgo(7 * 24 * 60 * 60),
      "7 days ago",
    ],
    [
      "8 days ago -> crosses into weeks-ago (singular)",
      secondsAgo(8 * 24 * 60 * 60),
      "1 week ago",
    ],
    [
      "14 days ago -> weeks-ago (plural)",
      secondsAgo(14 * 24 * 60 * 60),
      "2 weeks ago",
    ],
    [
      "400 days ago -> crosses into years-ago",
      secondsAgo(400 * 24 * 60 * 60),
      "1 year ago",
    ],
    [
      "800 days ago -> years-ago (plural)",
      secondsAgo(800 * 24 * 60 * 60),
      "2 years ago",
    ],
  ] as const)("%s", (_label, date, expected) => {
    expect(formatRelativeTime(date)).toBe(expected)
  })
})

describe("formatRelativeTime - future dates", () => {
  it("returns 'in the future' for a date after now", () => {
    const future = new Date(FIXED_NOW.getTime() + 60_000)
    expect(formatRelativeTime(future)).toBe("in the future")
  })
})

describe("formatRelativeTime - input types", () => {
  it("accepts an ISO string and a numeric timestamp identically to a Date", () => {
    const date = secondsAgo(120)
    expect(formatRelativeTime(date.toISOString())).toBe("2 minutes ago")
    expect(formatRelativeTime(date.getTime())).toBe("2 minutes ago")
  })
})
