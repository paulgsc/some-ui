/**
 * @vitest-environment node
 *
 * Studio's feed videos read home's answers as the screen shows them, refuse a
 * link home would refuse, and turn only on their own events.
 */
import { describe, expect, it } from "vitest"

import type { Episode } from "@/lib/call-videos/model"
import {
  INITIAL,
  isFeed,
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
    // The call's older shape, by week, is not this list.
    const { key: _key, ...rest } = episode()
    const older = JSON.stringify({
      episodes: [{ ...rest, from: "2026-10-30", to: "2026-11-05" }],
    })
    expect(readEpisodes({ status: 200, body: older })).toEqual({
      kind: "unreadable",
    })
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
      readLinkSaved({
        status: 200,
        body: '{"url":"https://youtu.be/dQw4w9WgXcQ"}',
      })
    ).toEqual({ kind: "saved", url: "https://youtu.be/dQw4w9WgXcQ" })
    expect(readLinkSaved({ status: 422, body: "{}" })).toEqual({
      kind: "notAVideo",
    })
    expect(readLinkSaved({ status: 409, body: "" })).toEqual({
      kind: "unreadable",
    })
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
