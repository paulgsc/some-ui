import { parseAskId } from "@video-render/ask"
import { answerRef, pendingOfRef, toFile } from "@video-render/pending"
import { describe, expect, it } from "vitest"

const heard = (over: Record<string, unknown>): unknown => ({
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
    ])
      expect(pendingOfRef(ref), ref).toBeNull()
    expect(parseAskId("server-725")).toEqual({ repo: "server", number: 725 })
  })
})

describe("toFile", () => {
  it("files each answer, oldest said first, whatever the clock's offset", () => {
    const { items } = toFile(
      [
        heard({ note: "n2", at: "2026-11-08T12:30:00-07:00" }),
        heard({ note: "n1", at: "2026-11-08T19:00:00Z" }),
      ],
      []
    )
    expect(items.map((item) => item.note)).toEqual(["n1", "n2"])
    expect(items[0]?.line).toBe("Kept on home as the take `n1`.")
  })

  it("never files a take an issue already carries, open or closed", () => {
    const body = `The owner chose the second option.\n\nKept on home as the take \`n1\`.`
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
        heard({ text: "  " }),
      ],
      []
    )
    expect(items).toEqual([])
    expect(passed.map((each) => each.place)).toEqual([2])
  })
})
