/**
 * @vitest-environment jsdom
 *
 * A concern's limits on its page: each one's name, where it stands once
 * counted, and what happens at it; a count that failed says so.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import type * as LimitsModule from "@/lib/limits"
import type { LimitRow } from "@/lib/limits"
import { PHONE_LIMITS, WHAT_HAPPENS } from "@/lib/limits/words"
import { DeviceLimits } from "@/components/settings/device-limits"

vi.mock("@/lib/limits", async (actual): Promise<typeof LimitsModule> => {
  const real = await actual<typeof LimitsModule>()
  const { PHONE_LIMITS: words } = await import("@/lib/limits/words")
  const rows: ReadonlyArray<LimitRow> = [
    {
      id: "wordSets",
      concern: "phone",
      words: words.wordSets,
      unit: "count",
      sources: [],
      read: () => Promise.resolve({ kept: 12, limit: 50 }),
    },
    {
      id: "stops",
      concern: "phone",
      words: words.stops,
      unit: "count",
      sources: [],
      read: () => Promise.reject(new Error("unreadable")),
    },
  ]
  return {
    ...real,
    limits: real.createLimits(rows),
    rowsOf: (): ReadonlyArray<LimitRow> => rows,
  }
})

afterEach(cleanup)

it("shows each limit, where it stands, and what happens at it", async () => {
  render(<DeviceLimits concern="phone" />)
  expect(await screen.findByText("12 of 50 kept")).toBeTruthy()
  expect(screen.getByText(PHONE_LIMITS.wordSets.what)).toBeTruthy()
  expect(screen.getByText(PHONE_LIMITS.wordSets.then)).toBeTruthy()
  expect(screen.getAllByText(WHAT_HAPPENS.refused)).toHaveLength(1)
  expect(screen.getByText("Couldn't count this just now.")).toBeTruthy()
})
