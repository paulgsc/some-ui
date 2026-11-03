/** @vitest-environment node */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

let pairedNow = true
let answer: HomeAnswer | Error | null = { status: 200, body: "{}" }
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

const { askKept, keptPath } = await import("@/lib/home-link/kept-read")

beforeEach(() => {
  pairedNow = true
  asked.length = 0
})

describe("the read of what home keeps (MD2)", () => {
  it("asks for the overview, or a kind's newest", () => {
    expect(keptPath(null)).toBe("/voice-notes/kept")
    expect(keptPath("rust-round")).toBe("/voice-notes/kept?of=rust-round")
  })

  it("hands back home's answer to one GET on a kind's page", async () => {
    answer = { status: 200, body: "{}" }
    await expect(askKept("studio")).resolves.toEqual({
      kind: "answered",
      answer,
      record: null,
    })
    expect(asked).toEqual([["GET", "/voice-notes/kept?of=studio"]])
  })

  it("asks for the record's count beside it on the overview, in the same run (MD2b)", async () => {
    answer = { status: 200, body: "{}" }
    await expect(askKept(null)).resolves.toEqual({
      kind: "answered",
      answer,
      record: answer,
    })
    expect(asked).toEqual([
      ["GET", "/voice-notes/kept"],
      ["GET", "/subjects/me/kept"],
    ])
  })

  it("asks nothing while unpaired", async () => {
    pairedNow = false
    await expect(askKept(null)).resolves.toEqual({ kind: "unpaired" })
    expect(asked).toEqual([])
  })

  it("says busy when the link is, and unreachable when nothing answers", async () => {
    answer = null
    await expect(askKept(null)).resolves.toEqual({ kind: "busy" })
    answer = new Error("no answer")
    await expect(askKept(null)).resolves.toEqual({ kind: "unreachable" })
  })
})
