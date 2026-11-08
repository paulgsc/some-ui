/**
 * SFEED5 (#2746): a Studio take answering an ask is named by `answerRef`,
 * read back by `pendingOfRef`, and filed once: `toFile` leaves out every
 * take an issue already carries the line of, and every transcript of
 * anything else.
 */
import {
  answerRef,
  filedLine,
  PENDING_LABELS,
  pendingOfRef,
  toFile,
} from "@video-render/pending"
import { describe, expect, it } from "vitest"

const heard = (
  over: Partial<{
    note: string
    of: string
    ref: string | null
    at: string
    text: string
  }>
): unknown => ({
  schema: "some-ui.voice-transcript/1",
  note: "n1",
  of: "studio",
  ref: answerRef({ repo: "some-ui", number: 2676 }),
  at: "2026-11-08T18:00:00.000Z",
  text: "the second one",
  language: "en",
  model: "small",
  heardAt: "2026-11-08T18:01:00.000Z",
  ...over,
})

describe("an answer's ref", () => {
  it("names the ask by its id and reads back to it, for both repositories", () => {
    expect(answerRef({ repo: "some-ui", number: 2676 })).toBe(
      "ask:some-ui-2676"
    )
    for (const repo of ["some-ui", "server"] as const)
      expect(pendingOfRef(answerRef({ repo, number: 725 }))).toEqual({
        kind: "ask",
        repo,
        about: 725,
      })
  })

  it("reads nothing from another take's ref, or an ask of no repository", () => {
    for (const ref of [
      "take:abc",
      "idea:i1:why",
      "build-journal-ep04:s3:2",
      "ask:some-ui",
      "ask:some-ui-0",
      "ask:other-12",
      "ask:-12",
      "ask",
    ])
      expect(pendingOfRef(ref), ref).toBeNull()
  })
})

describe("toFile", () => {
  it("files each answer once, from its last transcript, oldest said first", () => {
    const { items, passed } = toFile(
      [
        heard({ note: "n2", at: "2026-11-08T19:00:00.000Z" }),
        heard({ text: "first hearing" }),
        heard({ text: "second hearing" }),
      ],
      []
    )
    expect(passed).toEqual([])
    expect(items.map((item) => [item.note, item.heard])).toEqual([
      ["n1", "second hearing"],
      ["n2", "the second one"],
    ])
    expect(items[0]).toMatchObject({
      kind: "ask",
      repo: "some-ui",
      about: 2676,
      labels: PENDING_LABELS,
      line: filedLine("n1"),
    })
  })

  it("never files a take an issue already carries, open or closed", () => {
    const body = `The owner chose the second option.\n\n${filedLine("n1")}`
    expect(toFile([heard({})], [body]).items).toEqual([])
    expect(
      toFile([heard({})], ["mentions `n1` in passing"]).items
    ).toHaveLength(1)
  })

  it("leaves out every other kind of note, and reports what doesn't read", () => {
    const { items, passed } = toFile(
      [
        heard({ of: "reflection", ref: "session-1" }),
        heard({ ref: "take:t1" }),
        heard({ ref: null }),
        { schema: "something-else" },
        heard({ note: "quiet", text: "  " }),
      ],
      []
    )
    expect(items).toEqual([])
    expect(passed.map((each) => each.place)).toEqual([3, 4])
  })
})
