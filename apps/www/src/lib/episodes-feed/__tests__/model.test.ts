/**
 * @vitest-environment node
 *
 * Studio's Episodes, by week (EPISODES2): every feed's episodes in one feed,
 * placed by the day home knows for each where home says, else by the week its key
 * names, never at a guessed one; a call's parts on one row; each chip's count
 * over every feed, whatever the chip; and a feed that can't be read beside the
 * ones that can.
 */
import { describe, expect, it } from "vitest"

import type { Episode, ListState } from "@/lib/call-videos/model"
import type { FeedLists, Row } from "@/lib/episodes-feed"
import {
  feedView,
  keyDay,
  partStatus,
  rowLength,
  rowsOf,
  rowStatus,
} from "@/lib/episodes-feed"

const episode = (key: string, over: Partial<Episode> = {}): Episode => ({
  key,
  videoBytes: 1_000,
  restBytes: 10,
  link: null,
  receipts: [],
  ...over,
})

const read = (...episodes: Array<Episode>): ListState => ({
  kind: "read",
  episodes,
})

const LISTS: FeedLists = {
  call: read(
    episode("2026-11-06", { week: "2026-11-06", part: 1, of: 2 }),
    episode("2026-11-06-p2", { week: "2026-11-06", part: 2, of: 2 }),
    episode("2026-10-30")
  ),
  "cards-essay": read(episode("zfs-2026-11-12")),
  "playoff-delta": read(episode("2026-SF-10"), episode("2026-SF-09")),
  "interview-essay": read(),
  report: read(),
  "rust-essay": read(episode("2026-w45")),
}

describe("keyDay", () => {
  it("reads the day each feed's key names, and none from Playoff Delta's", () => {
    expect(keyDay("call", "2026-11-06")).toBe("2026-11-06")
    expect(keyDay("rust-essay", "2026-w45")).toBe("2026-11-02")
    expect(keyDay("interview-essay", "2026-w46")).toBe("2026-11-09")
    expect(keyDay("cards-essay", "zfs-2026-11-12")).toBe("2026-11-12")
    expect(keyDay("report", "2026-W46")).toBe("2026-11-09")
    expect(keyDay("playoff-delta", "2026-SF-10")).toBeNull()
  })

  it("reads none from a key that isn't one", () => {
    expect(keyDay("call", "2026-02-31")).toBeNull()
    expect(keyDay("call", "week-44")).toBeNull()
    expect(keyDay("rust-essay", "2027-w53")).toBeNull()
    expect(keyDay("cards-essay", "zfs")).toBeNull()
    expect(keyDay("report", "2027-W53")).toBeNull()
    // Each in its own spelling only.
    expect(keyDay("report", "2026-w46")).toBeNull()
    expect(keyDay("rust-essay", "2026-W46")).toBeNull()
  })
})

describe("rowsOf", () => {
  it("puts a week's parts on one row, first first, in home's order", () => {
    const rows = rowsOf("call", [
      episode("2026-11-06-p2", { week: "2026-11-06", part: 2, of: 2 }),
      episode("2026-11-06", { week: "2026-11-06", part: 1, of: 2 }),
      episode("2026-10-30"),
    ])
    expect(rows.map((row) => row.parts.map((part) => part.key))).toEqual([
      ["2026-11-06", "2026-11-06-p2"],
      ["2026-10-30"],
    ])
  })

  it("places a row by the day home knows before its key's", () => {
    const [sent] = rowsOf("playoff-delta", [
      episode("2026-SF-10", { date: "2026-11-10" }),
    ])
    expect(sent).toMatchObject({ day: "2026-11-10" })
    const [keyed] = rowsOf("call", [episode("2026-11-06", { date: null })])
    expect(keyed).toMatchObject({ day: "2026-11-06" })
  })

  it("ignores a date home sends that isn't a day", () => {
    for (const date of ["2026-13-01", "Friday", "", null]) {
      const [row] = rowsOf("call", [episode("2026-11-06", { date })])
      expect(row).toMatchObject({ day: "2026-11-06" })
    }
  })
})

describe("a row's dot and length", () => {
  it("says being made, on home, or on YouTube", () => {
    expect(partStatus(episode("a", { videoBytes: null }))).toBe("making")
    expect(partStatus(episode("a"))).toBe("home")
    const link = { url: "https://youtu.be/x", recordedAt: "2026-11-06" }
    expect(partStatus(episode("a", { link }))).toBe("out")
    const receipt = {
      key: "a",
      step: "video" as const,
      url: "https://youtu.be/x",
      size: 1,
      deletedAt: "2026-11-07",
    }
    expect(partStatus(episode("a", { receipts: [receipt] }))).toBe("out")
  })

  it("is on home while any part isn't up, and being made while any is", () => {
    const link = { url: "https://youtu.be/x", recordedAt: "2026-11-06" }
    const row = (...parts: Array<Episode>): Row => rowsOf("call", parts)[0]
    const up = episode("w", { week: "w", link })
    expect(rowStatus(row(up, episode("w-p2", { week: "w" })))).toBe("home")
    expect(rowStatus(row(up, episode("w-p2", { week: "w", link })))).toBe("out")
    expect(
      rowStatus(row(up, episode("w-p2", { week: "w", videoBytes: null })))
    ).toBe("making")
  })

  it("has a length only where home says one for every part", () => {
    const [none] = rowsOf("call", [episode("2026-11-06")])
    expect(rowLength(none)).toBeNull()
    const [both] = rowsOf("call", [
      episode("w", { week: "w", durationMs: 60_000 }),
      episode("w-p2", { week: "w", durationMs: 30_000 }),
    ])
    expect(rowLength(both)).toBe(90_000)
    const [half] = rowsOf("call", [
      episode("w", { week: "w", durationMs: 60_000 }),
      episode("w-p2", { week: "w" }),
    ])
    expect(rowLength(half)).toBeNull()
    // Home's whole week, while it holds every part, before any sum.
    const [week] = rowsOf("call", [
      episode("w", { week: "w", durationMs: 60_000, weekDurationMs: 95_000 }),
      episode("w-p2", {
        week: "w",
        durationMs: 35_000,
        weekDurationMs: 95_000,
      }),
    ])
    expect(rowLength(week)).toBe(95_000)
  })
})

describe("feedView", () => {
  it("mixes every feed by week, newest first, and lists the undated after", () => {
    const view = feedView(LISTS, "all")
    if (view.kind !== "shown") throw new Error("not shown")
    expect(
      view.weeks.map(({ monday, rows }) => [
        monday,
        rows.map((row) => `${row.feed}/${row.week}`),
      ])
    ).toEqual([
      ["2026-11-09", ["cards-essay/zfs-2026-11-12"]],
      ["2026-11-02", ["call/2026-11-06", "rust-essay/2026-w45"]],
      ["2026-10-26", ["call/2026-10-30"]],
    ])
    expect(view.undated.map((row) => row.week)).toEqual([
      "2026-SF-10",
      "2026-SF-09",
    ])
  })

  it("counts each chip's rows over every feed, whatever the chip", () => {
    const counts = {
      all: 6,
      call: 2,
      "cards-essay": 1,
      "interview-essay": 0,
      "playoff-delta": 2,
      report: 0,
      "rust-essay": 1,
    }
    for (const chip of ["all", "call", "rust-essay"] as const) {
      const view = feedView(LISTS, chip)
      expect(view.kind === "shown" && view.counts).toEqual(counts)
    }
  })

  it("shows only the chip's genre", () => {
    const view = feedView(LISTS, "call")
    if (view.kind !== "shown") throw new Error("not shown")
    const rows = [...view.weeks.flatMap((week) => week.rows), ...view.undated]
    expect(rows.map((row) => row.feed)).toEqual(["call", "call"])
  })

  it("says where a feed couldn't be read, beside the rest", () => {
    const lists: FeedLists = { ...LISTS, call: { kind: "away" } }
    const all = feedView(lists, "all")
    if (all.kind !== "shown") throw new Error("not shown")
    expect(all.trouble).toEqual([{ feed: "call", kind: "away" }])
    expect(all.counts.all).toBe(4)
    const other = feedView(lists, "rust-essay")
    expect(other.kind === "shown" && other.trouble).toEqual([])
  })

  it("says reading only for a feed the chip shows", () => {
    const lists: FeedLists = { ...LISTS, call: { kind: "reading" } }
    expect(feedView(lists, "all")).toMatchObject({ reading: true })
    expect(feedView(lists, "call")).toMatchObject({ reading: true })
    expect(feedView(lists, "rust-essay")).toMatchObject({ reading: false })
  })

  it("asks for pairing once, when the phone isn't paired", () => {
    expect(
      feedView({ ...LISTS, call: { kind: "unpaired" } }, "rust-essay")
    ).toEqual({ kind: "unpaired" })
  })
})
