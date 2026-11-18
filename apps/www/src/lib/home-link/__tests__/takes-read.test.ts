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
  homeLink: (): unknown => ({
    keep: async (
      run: (send: HomeCall) => Promise<unknown>
    ): Promise<
      { kind: "done"; value: unknown } | { kind: "refused"; why: string }
    > => {
      // A link busy with another run turns this one away.
      if (!pairedNow) return { kind: "refused", why: "unpaired" }
      if (answer === null) return { kind: "refused", why: "busy" }
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

const reported = vi.hoisted((): Array<string> => [])
vi.mock("@some-ui/intent-kit", async (actual) => ({
  ...(await actual<object>()),
  reportFailure: ({ port }: { port: string }): void => {
    reported.push(port)
  },
}))

const { askTakes, takesPath } = await import("@/lib/home-link/takes-read")
const { ForeignCallError } = await import("@/lib/intent/foreign")

beforeEach(() => {
  pairedNow = true
  answer = { status: 200, body: "{}" }
  asked.length = 0
})

describe("the read of the takes home keeps (ST32)", () => {
  it("asks for the newest, or for the takes whose words hold a search's", () => {
    // Every kind, from epoch 19; a home before it ignores `kind` (TAKES20).
    expect(takesPath(null)).toBe("/voice-notes/takes?kind=all")
    expect(takesPath("brand intro")).toBe(
      "/voice-notes/takes?kind=all&q=brand%20intro"
    )
    expect(takesPath(null, "t 9")).toBe(
      "/voice-notes/takes?kind=all&after=t%209"
    )
    // The kinds, topic and order picked, asked of home (TAKES20).
    expect(
      takesPath("rams", null, {
        kinds: ["game"],
        about: "game:401772",
        sort: "oldest",
      })
    ).toBe(
      "/voice-notes/takes?kind=game&about=game%3A401772&sort=oldest&q=rams"
    )
    expect(
      takesPath(null, null, {
        kinds: ["studio", "game"],
        about: null,
        sort: "newest",
      })
    ).toBe("/voice-notes/takes?kind=studio&kind=game")
  })

  it("hands back home's answer to one GET", async () => {
    await expect(askTakes("brand")).resolves.toEqual({
      kind: "answered",
      answer,
    })
    expect(asked).toEqual([["GET", "/voice-notes/takes?kind=all&q=brand"]])
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

  it("reports a fault on this phone once: a foreign port's own was reported by it (#3155)", async () => {
    reported.length = 0
    answer = new Error("a fault")
    await expect(askTakes(null)).resolves.toEqual({ kind: "unreachable" })
    expect(reported).toEqual(["home link: an ask of home"])
    answer = new ForeignCallError({
      kind: "unknown",
      retryable: false,
      summary: "The phone couldn't read or keep its pairing.",
      cause: null,
    })
    await expect(askTakes(null)).resolves.toEqual({ kind: "unreachable" })
    expect(reported).toEqual(["home link: an ask of home"])
  })
})
