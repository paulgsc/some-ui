/**
 * @vitest-environment node
 *
 * The read of the takes home keeps (ST32, `GET /voice-notes/takes`): one
 * GET, the search's words its only addition, and nothing asked while
 * unpaired.
 */
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

const { askTakes, takesPath } = await import("@/lib/home-link/takes-read")

beforeEach(() => {
  pairedNow = true
  answer = { status: 200, body: "{}" }
  asked.length = 0
})

describe("the read of the takes home keeps (ST32)", () => {
  it("asks for the newest, or for the takes whose words hold a search's", () => {
    expect(takesPath(null)).toBe("/voice-notes/takes")
    expect(takesPath("brand intro")).toBe("/voice-notes/takes?q=brand%20intro")
  })

  it("hands back home's answer to one GET", async () => {
    await expect(askTakes("brand")).resolves.toEqual({
      kind: "answered",
      answer,
    })
    expect(asked).toEqual([["GET", "/voice-notes/takes?q=brand"]])
  })

  it("asks nothing while unpaired", async () => {
    pairedNow = false
    await expect(askTakes(null)).resolves.toEqual({ kind: "unpaired" })
    expect(asked).toEqual([])
  })

  it("says busy when the link is, and unreachable when nothing answers", async () => {
    answer = null
    await expect(askTakes(null)).resolves.toEqual({ kind: "busy" })
    answer = new Error("no answer")
    await expect(askTakes(null)).resolves.toEqual({ kind: "unreachable" })
  })
})
