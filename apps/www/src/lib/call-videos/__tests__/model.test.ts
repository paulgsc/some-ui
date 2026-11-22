/**
 * @vitest-environment node
 *
 * Studio's feed videos read home's answers as the screen shows them, refuse a
 * link home would refuse, and turn only on their own events.
 */
import { describe, expect, it } from "vitest"

import type { Episode } from "@/lib/call-videos/model"
import {
  homeBytes,
  INITIAL,
  isFeed,
  listedEpisode,
  partOf,
  readEpisodes,
  readLinkSaved,
  readPart,
  standing,
  step,
} from "@/lib/call-videos/model"

const episode = (over: Partial<Episode> = {}): Episode => ({
  key: "2026-10-30",
  videoBytes: 10,
  restBytes: 5,
  link: null,
  receipts: [],
  ...over,
})

describe("readEpisodes", () => {
  it("reads home's list, an older home, and what can't be read", () => {
    const pd = episode({ key: "2026-SF-08" })
    const body = JSON.stringify({ episodes: [episode(), pd] })
    expect(readEpisodes({ status: 200, body })).toEqual({
      kind: "read",
      episodes: [episode(), pd],
    })
    expect(readEpisodes({ status: 404, body: "" })).toEqual({ kind: "older" })
    expect(readEpisodes({ status: 500, body: "" })).toEqual({
      kind: "unreadable",
    })
    expect(readEpisodes({ status: 200, body: '{"episodes":[{}]}' })).toEqual({
      kind: "unreadable",
    })
  })

  it("reads a cards essay's title, and a feed's episodes with none or from before it", () => {
    const essay = episode({ key: "zfs-2026-11-02", title: "How ZFS snapshots" })
    const untitled = episode({ key: "nix-2026-11-01", title: null })
    const one = { part: 1, of: 1 }
    const episodes = [
      { ...essay, week: essay.key, ...one },
      { ...untitled, week: untitled.key, ...one },
      episode(),
    ]
    const body = JSON.stringify({ episodes })
    expect(readEpisodes({ status: 200, body })).toEqual({
      kind: "read",
      episodes,
    })
  })

  it("reads a week's parts, and the day and length home says (#2918, EPISODES2)", () => {
    const parts = [
      episode({ key: "2026-11-06", week: "2026-11-06", part: 1, of: 2 }),
      episode({
        key: "2026-11-06-p2",
        week: "2026-11-06",
        part: 2,
        of: 2,
        date: "2026-11-13",
        durationMs: 596_000,
      }),
    ]
    const body = JSON.stringify({ episodes: parts })
    expect(readEpisodes({ status: 200, body })).toEqual({
      kind: "read",
      episodes: parts,
    })
    // What home doesn't know it sends as null, and the list still reads.
    const unknown = JSON.stringify({
      episodes: [
        episode({ date: null, durationMs: null, weekDurationMs: null }),
      ],
    })
    expect(readEpisodes({ status: 200, body: unknown })).toEqual({
      kind: "read",
      episodes: [
        episode({ date: null, durationMs: null, weekDurationMs: null }),
      ],
    })
    // A day that isn't one is the page's to ignore, not the list's to refuse.
    const odd = JSON.stringify({ episodes: [episode({ date: "Friday" })] })
    expect(readEpisodes({ status: 200, body: odd }).kind).toBe("read")
  })
})

describe("isFeed", () => {
  it("names the call and Playoff Delta, and nothing else", () => {
    expect(["call", "playoff-delta", "calls", "", true].map(isFeed)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
  })
})

describe("partOf (#3155)", () => {
  it("reads home's answer, keeps busy apart, and says the rest as away", () => {
    expect(
      partOf({ kind: "answered", answer: { status: 404, body: "" } })
    ).toEqual({ kind: "gone" })
    expect(partOf({ kind: "busy" })).toEqual({ kind: "busy" })
    expect(partOf({ kind: "unreachable" })).toEqual({ kind: "away" })
    expect(partOf({ kind: "unpaired" })).toEqual({ kind: "away" })
  })
})

describe("readPart", () => {
  it("reads a range's bytes, a video gone and anything else", () => {
    expect(readPart({ status: 206, body: "AAEC" })).toEqual({
      kind: "bytes",
      base64: "AAEC",
    })
    expect(readPart({ status: 404, body: "" })).toEqual({ kind: "gone" })
    expect(readPart({ status: 206, body: "" })).toEqual({ kind: "unreadable" })
    expect(readPart({ status: 416, body: "x" })).toEqual({ kind: "unreadable" })
  })
})

describe("readLinkSaved", () => {
  it("reads the link home kept, and a link home refused", () => {
    expect(
      readLinkSaved("call", {
        status: 200,
        body: '{"url":"https://youtu.be/dQw4w9WgXcQ"}',
      })
    ).toEqual({ kind: "saved", url: "https://youtu.be/dQw4w9WgXcQ" })
    expect(readLinkSaved("call", { status: 422, body: "{}" })).toEqual({
      kind: "notAVideo",
    })
    expect(readLinkSaved("call", { status: 409, body: "" })).toEqual({
      kind: "unreadable",
    })
  })

  it("reads a cards essay's link home didn't take as an older home", () => {
    const missing = { status: 404, body: "" }
    expect(readLinkSaved("cards-essay", missing)).toEqual({ kind: "older" })
    expect(readLinkSaved("rust-essay", missing)).toEqual({
      kind: "unreadable",
    })
  })
})

describe("homeBytes", () => {
  it("sums each video and its rest that home holds, and is null for none", () => {
    expect(
      homeBytes([
        episode(),
        episode({ key: "2026-11-06", videoBytes: null, restBytes: 7 }),
      ])
    ).toBe(22)
    expect(homeBytes([])).toBeNull()
    expect(homeBytes([episode({ videoBytes: null, restBytes: null })])).toBe(
      null
    )
    expect(homeBytes([episode({ videoBytes: null, restBytes: 0 })])).toBeNull()
  })
})

describe("standing", () => {
  it("is let go once the video's receipt is in, waiting with no video, kept otherwise", () => {
    expect(standing(episode())).toBe("kept")
    expect(standing(episode({ videoBytes: null, restBytes: null }))).toBe(
      "waiting"
    )
    const receipt = {
      key: "2026-10-30",
      step: "video" as const,
      url: "https://youtu.be/dQw4w9WgXcQ",
      size: 10,
      deletedAt: "2026-11-07T12:00:00.000Z",
    }
    expect(standing(episode({ videoBytes: null, receipts: [receipt] }))).toBe(
      "letGo"
    )
  })
})

describe("step", () => {
  it("keeps a read list on screen while it is read again, and says a link was saved", () => {
    const read = step(INITIAL, {
      type: "listEnded",
      list: { kind: "read", episodes: [episode()] },
    })
    expect(step(read, { type: "listAsked" })).toBe(read)
    const saving = step(read, { type: "linkSaving", key: "2026-10-30" })
    expect(saving.links["2026-10-30"]).toEqual({ kind: "saving" })
    const saved = step(saving, {
      type: "linkEnded",
      key: "2026-10-30",
      saved: { kind: "saved", url: "https://youtu.be/dQw4w9WgXcQ" },
    })
    expect(saved.links["2026-10-30"]).toBeUndefined()
    expect(saved.said).toEqual({ kind: "linkSaved", key: "2026-10-30" })
    expect(step(saved, { type: "saidSeen" }).said).toBeNull()
  })
})

describe("listedEpisode (#2899)", () => {
  const episode = {
    key: "2026-w45",
    videoBytes: 10,
    restBytes: null,
    link: null,
    receipts: [],
  }

  it("finds the episode a page opened by its key", () => {
    expect(
      listedEpisode({ kind: "read", episodes: [episode] }, "2026-w45")
    ).toBe(episode)
  })

  it("finds none for a key the list hides, so the page says so rather than nothing", () => {
    // Renders links by the board's key, which can name an essay the list hides.
    expect(
      listedEpisode({ kind: "read", episodes: [episode] }, "2026-w44")
    ).toBeNull()
    expect(listedEpisode({ kind: "reading" }, "2026-w45")).toBeNull()
  })
})
