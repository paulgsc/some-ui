/**
 * @vitest-environment node
 *
 * PO1 (#3157): what Studio's Feedback page says home holds of each note is
 * not known while the pairing record is read, and never said as none. And
 * the read of every feed (#3035): a feed an older home keeps no notes on
 * waits on its own, and the others' answers still count.
 */
import { describe, expect, it, vi } from "vitest"

import type { Feed } from "@/lib/feeds"
import type { Pairing } from "@/lib/home-link"
import type { Asked } from "@/lib/home-link/while-busy"

const link = vi.hoisted((): { now: Pairing } => ({ now: { kind: "reading" } }))

/** Home's status for each feed's notes; `200` with one note by default. */
const home = vi.hoisted((): { status: Partial<Record<string, number>> } => ({
  status: {},
}))

vi.mock("@/lib/home-link", () => ({ pairing: (): Pairing => link.now }))

vi.mock("@/lib/home-link/episode-notes-read", () => ({
  askEpisodeNotes: (feed: Feed): Promise<Asked> =>
    Promise.resolve({
      kind: "answered",
      answer: {
        status: home.status[feed] ?? 200,
        body: JSON.stringify({
          notes: [{ id: `${feed}-1`, storedAt: "2026-11-18T03:00:00Z" }],
        }),
      },
    }),
}))

const { notesAnswered, readHomeNotes } = await import(
  "@/lib/episode-feedback/home-read"
)

describe("what home holds of each note (PO1)", () => {
  it("is not known while the pairing record is read", () => {
    link.now = { kind: "reading" }
    expect(notesAnswered()).toBeNull()
  })

  it("is known, and empty, once the record says this phone isn't paired", () => {
    link.now = { kind: "unpaired" }
    expect(notesAnswered()).toEqual({ held: new Set(), refused: new Set() })
  })

  it("is known once the record says this phone is paired", () => {
    link.now = { kind: "paired", id: "p1" }
    expect(notesAnswered()).not.toBeNull()
  })
})

describe("the read of every feed's notes (#3035)", () => {
  it("reads every feed's notes from a home that keeps them all", async () => {
    home.status = {}
    const read = await readHomeNotes()
    expect(read.kind === "read" && [...read.storedAt.keys()]).toEqual([
      "call-1",
      "cards-essay-1",
      "interview-essay-1",
      "playoff-delta-1",
      "rust-essay-1",
    ])
    expect(read.kind === "read" && read.notYet.size).toBe(0)
  })

  it("names the feeds an older home keeps no notes on, and still counts the rest", async () => {
    home.status = {
      "cards-essay": 404,
      "interview-essay": 404,
      "rust-essay": 404,
    }
    const read = await readHomeNotes()
    expect(read.kind === "read" && [...read.notYet]).toEqual([
      "cards-essay",
      "interview-essay",
      "rust-essay",
    ])
    expect(read.kind === "read" && [...read.storedAt.keys()]).toEqual([
      "call-1",
      "playoff-delta-1",
    ])
  })

  it("is older when home keeps notes on no feed", async () => {
    home.status = {
      call: 404,
      "cards-essay": 404,
      "interview-essay": 404,
      "playoff-delta": 404,
      "rust-essay": 404,
    }
    expect(await readHomeNotes()).toEqual({ kind: "older" })
  })
})
