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

const { askDeleted } = await import("@/lib/home-link/deleted-read")

beforeEach(() => {
  pairedNow = true
  asked.length = 0
})

describe("the read of what My data deleted (MD3)", () => {
  it("hands back home's answer to one GET", async () => {
    answer = { status: 200, body: "{}" }
    await expect(askDeleted()).resolves.toEqual({ kind: "answered", answer })
    expect(asked).toEqual([["GET", "/voice-notes/deleted"]])
  })

  it("asks nothing while unpaired; busy and unreachable as the link says", async () => {
    pairedNow = false
    await expect(askDeleted()).resolves.toEqual({ kind: "unpaired" })
    pairedNow = true
    answer = null
    await expect(askDeleted()).resolves.toEqual({ kind: "busy" })
    answer = new Error("no answer")
    await expect(askDeleted()).resolves.toEqual({ kind: "unreachable" })
    expect(asked).toEqual([["GET", "/voice-notes/deleted"]])
  })
})
