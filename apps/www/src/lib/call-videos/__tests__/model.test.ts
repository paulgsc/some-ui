/**
 * @vitest-environment node
 *
 * Studio's Calls reads home's answers as the screen shows them, refuses a
 * link home would refuse, and turns only on its own events.
 */
import { describe, expect, it } from "vitest"

import type { Week } from "@/lib/call-videos/model"
import {
  INITIAL,
  readLinkSaved,
  readPart,
  readWeeks,
  standing,
  step,
  youtubeId,
} from "@/lib/call-videos/model"

const week = (over: Partial<Week> = {}): Week => ({
  from: "2026-10-30",
  to: "2026-11-05",
  videoBytes: 10,
  restBytes: 5,
  link: null,
  receipts: [],
  ...over,
})

describe("readWeeks", () => {
  it("reads home's list, an older home, and what can't be read", () => {
    const body = JSON.stringify({ weeks: [week()] })
    expect(readWeeks({ status: 200, body })).toEqual({
      kind: "read",
      weeks: [week()],
    })
    expect(readWeeks({ status: 404, body: "" })).toEqual({ kind: "older" })
    expect(readWeeks({ status: 500, body: "" })).toEqual({ kind: "unreadable" })
    expect(readWeeks({ status: 200, body: '{"weeks":[{}]}' })).toEqual({
      kind: "unreadable",
    })
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

describe("youtubeId", () => {
  it("reads a YouTube video's id as home does, and nothing else", () => {
    const id = "dQw4w9WgXcQ"
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ#comments",
      "youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      " https://youtu.be/dQw4w9WgXcQ?si=abc ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      expect(youtubeId(link), link).toBe(id)
    }
    for (const link of [
      "",
      "https://www.youtube.com/@paulgsc",
      "https://www.youtube.com/playlist?list=PL1234567890",
      "https://youtu.be/short",
      "https://youtu.be/dQw4w9WgXcQ1",
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(youtubeId(link), link).toBeNull()
    }
  })
})

describe("standing", () => {
  it("is let go once the video's receipt is in, waiting with no video, kept otherwise", () => {
    expect(standing(week())).toBe("kept")
    expect(standing(week({ videoBytes: null, restBytes: null }))).toBe(
      "waiting"
    )
    const receipt = {
      from: "2026-10-30",
      step: "video" as const,
      url: "https://youtu.be/dQw4w9WgXcQ",
      size: 10,
      deletedAt: "2026-11-07T12:00:00.000Z",
    }
    expect(standing(week({ videoBytes: null, receipts: [receipt] }))).toBe(
      "letGo"
    )
  })
})

describe("step", () => {
  it("keeps a read list on screen while it is read again, and says a link was saved", () => {
    const read = step(INITIAL, {
      type: "listEnded",
      list: { kind: "read", weeks: [week()] },
    })
    expect(step(read, { type: "listAsked" })).toBe(read)
    const saving = step(read, { type: "linkSaving", from: "2026-10-30" })
    expect(saving.links["2026-10-30"]).toEqual({ kind: "saving" })
    const saved = step(saving, {
      type: "linkEnded",
      from: "2026-10-30",
      saved: { kind: "saved", url: "https://youtu.be/dQw4w9WgXcQ" },
    })
    expect(saved.links["2026-10-30"]).toBeUndefined()
    expect(saved.said).toEqual({ kind: "linkSaved", from: "2026-10-30" })
    expect(step(saved, { type: "saidSeen" }).said).toBeNull()
  })
})
