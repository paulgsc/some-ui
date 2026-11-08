/**
 * @vitest-environment node
 *
 * My data's delete through the link (MD3, #2477): one tap's `send`, one
 * `DELETE` per note named, in order, home's answers handed back as they
 * came; a request that fails on the way ends the run there.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

let pairedNow = true
let busy = false
let answers: Array<HomeAnswer | Error> = []
const asked: Array<[string, string]> = []
/** Whether the tap's run holds the link. */
let inRun = false
/** What `settle` heard, and whether the run held the link then. */
const heard: Array<{ said: DeleteAsked; inRun: boolean }> = []
const settled = (said: DeleteAsked): Promise<void> => {
  heard.push({ said, inRun })
  return Promise.resolve()
}

vi.mock("@/lib/home-link", () => ({
  paired: (): boolean => pairedNow,
  homeLink: (): unknown => ({
    send: async (
      run: (send: HomeCall) => Promise<unknown>
    ): Promise<{ kind: "done"; value: unknown } | null> => {
      if (busy) return null
      inRun = true
      try {
        const value = await run((method, path) => {
          asked.push([method, path])
          const next = answers.shift() ?? new Error("no answer")
          return next instanceof Error
            ? Promise.reject(next)
            : Promise.resolve(next)
        })
        return { kind: "done", value }
      } finally {
        inRun = false
      }
    },
  }),
}))

const { deleteNotes, deletePath } = await import("@/lib/home-link/delete-note")
type DeleteAsked = Parameters<Parameters<typeof deleteNotes>[1]>[0]

beforeEach(() => {
  pairedNow = true
  busy = false
  answers = []
  asked.length = 0
  heard.length = 0
})

describe("My data's delete through the link (MD3)", () => {
  it("names the note in the path", () => {
    expect(deletePath("a b")).toBe("/voice-notes/a%20b")
  })

  it("sends one DELETE per note, in order, and hands back each answer", async () => {
    const gone = { status: 200, body: "{}" }
    const kept = { status: 409, body: "{}" }
    answers = [gone, kept]
    await deleteNotes(["t1", "t2"], settled)
    expect(heard.map((each) => each.said)).toEqual([
      {
        kind: "answered",
        answers: [
          { id: "t1", answer: gone },
          { id: "t2", answer: kept },
        ],
      },
    ])
    expect(asked).toEqual([
      ["DELETE", "/voice-notes/t1"],
      ["DELETE", "/voice-notes/t2"],
    ])
    // Heard inside the run, so the phone lets go before a drain run could
    // send one of them again.
    expect(heard.map((each) => each.inRun)).toEqual([true])
  })

  it("ends the run at a request that fails, sending none after it", async () => {
    const gone = { status: 200, body: "{}" }
    answers = [gone, new Error("no answer"), gone]
    await deleteNotes(["t1", "t2", "t3"], settled)
    expect(heard.map((each) => each.said)).toEqual([
      {
        kind: "answered",
        answers: [
          { id: "t1", answer: gone },
          { id: "t2", answer: null },
          { id: "t3", answer: null },
        ],
      },
    ])
    expect(asked).toHaveLength(2)
  })

  it("sends nothing unpaired or busy, and says unreachable when nothing answers", async () => {
    pairedNow = false
    await deleteNotes(["t1"], settled)
    pairedNow = true
    busy = true
    await deleteNotes(["t1"], settled)
    expect(asked).toEqual([])
    busy = false
    answers = [new Error("no answer")]
    await deleteNotes(["t1"], settled)
    expect(heard.map((each) => each.said.kind)).toEqual([
      "unpaired",
      "busy",
      "unreachable",
    ])
  })
})
