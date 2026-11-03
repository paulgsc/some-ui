/** @vitest-environment node */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"

let pairedNow = true
let answer: HomeAnswer | Error | null = { status: 200, body: "{}" }
/** What the record's read alone meets, when it differs from `answer`. */
let recordFails: Error | null = null
const asked: Array<[string, string]> = []

vi.mock("@/lib/home-link", () => ({
  paired: (): boolean => pairedNow,
  homeLink: (): unknown => ({
    keep: async (
      run: (send: HomeCall) => Promise<unknown>
    ): Promise<
      { kind: "done"; value: unknown } | { kind: "stopped" } | null
    > => {
      // A link busy with another run turns this one away.
      if (answer === null) return null
      const reply = answer
      try {
        const value = await run((method, path) => {
          asked.push([method, path])
          const met =
            recordFails !== null && path === "/subjects/me/kept"
              ? recordFails
              : reply
          return met instanceof Error
            ? Promise.reject(met)
            : Promise.resolve(met)
        })
        return { kind: "done", value }
      } catch (error) {
        // As the link's `keep`: a stopped run is said, not thrown.
        if (error instanceof SyncStoppedError) return { kind: "stopped" }
        throw error
      }
    },
  }),
}))

const { askKept, keptPath } = await import("@/lib/home-link/kept-read")

beforeEach(() => {
  pairedNow = true
  recordFails = null
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

  it("asks for the record's count beside it on the overview, in the same run, whose failure keeps the recordings' answer (MD2b)", async () => {
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
    // The record's read getting no answer keeps the recordings' answer.
    recordFails = new Error("no answer")
    await expect(askKept(null)).resolves.toEqual({
      kind: "answered",
      answer,
      record: "unanswered",
    })
    // A stop still ends the whole run, to be asked again.
    recordFails = new SyncStoppedError()
    await expect(askKept(null)).resolves.toEqual({ kind: "busy" })
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
