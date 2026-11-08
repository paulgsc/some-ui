/**
 * @vitest-environment node
 *
 * SFEED6 (#2745): the note being written on an episode's page. Where each
 * category goes is `@some-ui/video-render`'s, tested there.
 */
import { describe, expect, it } from "vitest"

import type { Category, Draft } from "@/lib/episode-feedback"
import {
  CLOSED,
  keepable,
  momentOf,
  noteOf,
  NoteSchema,
  spokenLine,
  spokenTakeOf,
  step,
} from "@/lib/episode-feedback"

const open = (picked: ReadonlyArray<Category> = []): Draft => ({
  kind: "open",
  id: "n1",
  atMs: 134_000,
  picked,
  refused: null,
})

describe("the note being written", () => {
  it("opens at the moment the video stood at, and keeps it", () => {
    const opened = step(CLOSED, { type: "opened", id: "n1", atMs: 134_000 })
    expect(opened).toEqual(open())
    expect(
      step(open(["pacing"]), { type: "opened", id: "n2", atMs: 9 })
    ).toEqual(open(["pacing"]))
  })

  it("toggles a category on and off, in the set's order", () => {
    let draft = step(open(), { type: "toggled", category: "voice" })
    draft = step(draft, { type: "toggled", category: "shallow" })
    expect(draft).toEqual(open(["shallow", "voice"]))
    expect(step(draft, { type: "toggled", category: "voice" })).toEqual(
      open(["shallow"])
    )
    expect(step(CLOSED, { type: "toggled", category: "voice" })).toBe(CLOSED)
  })

  it("closes once kept, and stays open with its picks when refused", () => {
    expect(step(open(["voice"]), { type: "kept", came: "kept" })).toBe(CLOSED)
    const refused = step(open(["voice"]), { type: "kept", came: "full" })
    expect(refused).toEqual({ ...open(["voice"]), refused: "full" })
    expect(step(refused, { type: "toggled", category: "pacing" })).toEqual(
      open(["pacing", "voice"])
    )
    expect(step(open(["voice"]), { type: "cancelled" })).toBe(CLOSED)
  })

  it("can be kept only with something picked", () => {
    expect(keepable(CLOSED)).toBe(false)
    expect(keepable(open())).toBe(false)
    expect(keepable(open(["tooShort"]))).toBe(true)
  })

  it("becomes a note", () => {
    const where = { feed: "call", episode: "2026-11-13" } as const
    const made = { now: new Date("2026-11-14T03:00:00Z"), take: null }
    expect(noteOf(open(), where, made)).toBeNull()
    const note = noteOf(open(["overlap"]), where, made)
    expect(note).toEqual({
      id: "n1",
      feed: "call",
      episode: "2026-11-13",
      atMs: 134_000,
      categories: ["overlap"],
      writtenAt: "2026-11-14T03:00:00.000Z",
    })
    expect(
      noteOf(open(["overlap"]), where, { ...made, take: "t2" })?.take
    ).toBe("t2")
  })

  it("names the newest take said for it, and none of another note's or set aside", () => {
    const take = (
      id: string,
      answers: string,
      recordedAt: string,
      standing: "current" | "earlier" | "set-aside" = "current"
    ): {
      id: string
      answers: string
      recordedAt: string
      standing: "current" | "earlier" | "set-aside"
    } => ({ id, answers, recordedAt, standing })
    const line = spokenLine("n1")
    expect(spokenTakeOf([], "n1")).toBeNull()
    expect(
      spokenTakeOf(
        [
          take("old", line, "2026-11-14T03:00:00.000Z"),
          take("new", line, "2026-11-14T03:01:00.000Z"),
          take("aside", line, "2026-11-14T03:02:00.000Z", "set-aside"),
          take("other", spokenLine("n2"), "2026-11-14T03:03:00.000Z"),
          take("library", "library", "2026-11-14T03:04:00.000Z"),
        ],
        "n1"
      )
    ).toBe("new")
  })

  it("keeps a take said only while the note is open: one opened again is another note", () => {
    const first = step(CLOSED, { type: "opened", id: "n1", atMs: 0 })
    const again = step(step(first, { type: "cancelled" }), {
      type: "opened",
      id: "n2",
      atMs: 0,
    })
    const said = [
      {
        id: "t1",
        answers: spokenLine("n1"),
        recordedAt: "2026-11-14T03:00:00.000Z",
        standing: "current" as const,
      },
    ]
    expect(first.kind === "open" && spokenTakeOf(said, first.id)).toBe("t1")
    expect(again.kind === "open" && spokenTakeOf(said, again.id)).toBeNull()
  })

  it("reads back a stored note only with its picks each once, in order", () => {
    const note = {
      id: "n1",
      feed: "call",
      episode: "2026-11-13",
      atMs: 0,
      categories: ["shallow", "voice"],
      writtenAt: "2026-11-14T03:00:00.000Z",
    }
    expect(NoteSchema.safeParse(note).success).toBe(true)
    for (const categories of [["voice", "shallow"], ["voice", "voice"], []]) {
      expect(NoteSchema.safeParse({ ...note, categories }).success).toBe(false)
    }
    expect(
      NoteSchema.safeParse({ ...note, writtenAt: "Tuesday" }).success
    ).toBe(false)
    expect(NoteSchema.safeParse({ ...note, take: "t1" }).success).toBe(true)
    expect(NoteSchema.safeParse({ ...note, take: "" }).success).toBe(false)
  })

  it("reads a player's seconds as whole milliseconds, never below zero", () => {
    expect(momentOf(134.5678)).toBe(134_567)
    expect(momentOf(Number.NaN)).toBe(0)
    expect(momentOf(-2)).toBe(0)
  })
})
