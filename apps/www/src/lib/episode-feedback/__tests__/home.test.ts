/**
 * @vitest-environment node
 *
 * SFEED6 (#2745): the notes home keeps on a feed's episodes, as Studio's
 * Feedback page reads `GET /feeds/:feed/notes`.
 */
import { describe, expect, it } from "vitest"

import { readFeedNotes } from "@/lib/episode-feedback/home"

const answer = (status: number, body: unknown = {}) => ({
  status,
  body: JSON.stringify(body),
})

describe("home's notes on a feed", () => {
  it("reads when home came to keep each note, by its id", () => {
    const read = readFeedNotes(
      answer(200, {
        notes: [
          {
            id: "a",
            episode: "2026-11-13",
            atMs: 1,
            categories: ["pacing"],
            take: null,
            writtenAt: "2026-11-14T03:00:00.000Z",
            storedAt: "2026-11-14T03:01:00.000Z",
          },
        ],
      })
    )
    expect(read).toEqual({
      kind: "read",
      storedAt: new Map([["a", "2026-11-14T03:01:00.000Z"]]),
    })
  })

  it("reads a home without notes as older, and anything else as unreadable", () => {
    expect(readFeedNotes(answer(404))).toEqual({ kind: "older" })
    expect(readFeedNotes(answer(500))).toEqual({ kind: "unreadable" })
    expect(readFeedNotes(answer(200, { notes: [{ id: "a" }] }))).toEqual({
      kind: "unreadable",
    })
  })
})
