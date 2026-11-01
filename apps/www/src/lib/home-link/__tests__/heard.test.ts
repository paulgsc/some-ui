/** @vitest-environment node */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

let pairedNow = true
let answer: HomeAnswer | Error | null = { status: 404, body: "" }
const asked: Array<[string, string]> = []

vi.mock("@/lib/home-link", () => ({
  paired: (): boolean => pairedNow,
  homeLink: (): unknown => ({
    keep: async (
      run: (send: HomeCall) => Promise<unknown>
    ): Promise<{ kind: "done"; value: unknown } | null> => {
      // A link busy with another run turns this one away.
      if (answer === null) return null
      const reply = answer
      const value = await run((method, path) => {
        asked.push([method, path])
        return reply instanceof Error
          ? Promise.reject(reply)
          : Promise.resolve(reply)
      })
      return { kind: "done", value }
    },
  }),
}))

const { askHeard, heardPath, readHeard } = await import("@/lib/home-link/heard")

const ok = (body: unknown): HomeAnswer => ({
  status: 200,
  body: JSON.stringify(body),
})

beforeEach(() => {
  pairedNow = true
  asked.length = 0
})

describe("home's words for a take (MIC10, GET /voice-notes/:id/heard)", () => {
  it("reads not held, held and not heard, and heard, ignoring other fields", () => {
    expect(readHeard({ status: 404, body: "" })).toEqual({ kind: "notHeld" })
    expect(readHeard(ok({ heard: null }))).toEqual({ kind: "notYet" })
    expect(
      readHeard(
        ok({
          heard: {
            text: "a short about the picks",
            heardAt: "2026-11-01T09:00:00Z",
            language: "en",
          },
          note: "t1",
        })
      )
    ).toEqual({ kind: "heard", text: "a short about the picks" })
    expect(
      readHeard(ok({ heard: { text: "", heardAt: "2026-11-01T09:00:00Z" } }))
    ).toEqual({ kind: "heard", text: "" })
  })

  it("reads anything else as home not answering as it should", () => {
    for (const odd of [
      { status: 500, body: "" },
      { status: 401, body: "" },
      { status: 200, body: "not json" },
      ok({}),
      ok({ heard: { text: 3, heardAt: "then" } }),
      ok({ heard: { text: "no time" } }),
    ]) {
      expect(readHeard(odd)).toEqual({ kind: "unreachable" })
    }
  })

  it("asks once, by the note's id encoded, through the link", async () => {
    answer = ok({ heard: null })
    expect(await askHeard("idea take:1")).toEqual({ kind: "notYet" })
    expect(asked).toEqual([["GET", "/voice-notes/idea%20take%3A1/heard"]])
    expect(heardPath("t1")).toBe("/voice-notes/t1/heard")
  })

  it("is busy, asking nothing, when the link is busy with another run", async () => {
    answer = null
    expect(await askHeard("t1")).toEqual({ kind: "busy" })
    expect(asked).toEqual([])
  })

  it("is unreachable when unpaired, asking nothing, or when home doesn't answer", async () => {
    pairedNow = false
    expect(await askHeard("t1")).toEqual({ kind: "unreachable" })
    expect(asked).toEqual([])
    pairedNow = true
    answer = new Error("no answer")
    expect(await askHeard("t1")).toEqual({ kind: "unreachable" })
  })
})
