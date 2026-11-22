/**
 * LeetType's look at the session files the paired home holds (#1916): the
 * look is `./listing`'s (Korean's routine look holds that family in
 * `./routine.test.ts`), sending one `GET /leetype/session-files` paired and
 * in front, and saying how a look that brought nothing ended; a fetch of
 * one file goes only paired and in front, never rejects, and names each
 * way it ends.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import type { LeetypeFileReads } from "@/lib/home-link/leetype-files"
import { createLeetypeFileReads } from "@/lib/home-link/leetype-files"
import type { HomeLink } from "@/lib/home-link/runtime"

const FILES = {
  files: [{ name: "t1-01-a.json", title: "A", oneLine: "One line." }],
}

type Home = {
  sent: Array<string>
  /** Which keep each request went through. */
  via: Array<"look" | "tap">
  answer: () => Promise<HomeAnswer>
  pairing: string | null
  visible: boolean
}

function keepOf(home: Home, via: "look" | "tap"): HomeLink["keep"] {
  return async (run) => {
    if (home.pairing === null) return { kind: "refused", why: "unpaired" }
    const send: HomeCall = (method, path) => {
      home.sent.push(`${method} ${path}`)
      home.via.push(via)
      return home.answer()
    }
    try {
      return { kind: "done", value: await run(send) }
    } catch (error) {
      if (error instanceof SyncStoppedError) return { kind: "stopped" }
      throw error
    }
  }
}

function readsOf(over: Partial<Home> = {}): {
  home: Home
  reads: LeetypeFileReads
} {
  const home: Home = {
    sent: [],
    via: [],
    answer: () => Promise.resolve({ status: 200, body: JSON.stringify(FILES) }),
    pairing: "pairing-1",
    visible: true,
    ...over,
  }
  const reads = createLeetypeFileReads({
    keep: keepOf(home, "look"),
    keepTapped: keepOf(home, "tap"),
    pairing: () => home.pairing,
    visible: () => home.visible,
    now: () => 10,
    onLink: () => (): void => undefined,
  })
  return { home, reads }
}

describe("LeetType's look at home's session files", () => {
  it("sends one look at its own path, paired and in front, and nothing otherwise", async () => {
    const { home, reads } = readsOf({ visible: false })
    await expect(reads.list()).resolves.toEqual({
      files: { files: [] },
      ended: null,
    })
    expect(home.sent).toEqual([])
    home.visible = true
    await expect(reads.list()).resolves.toEqual({ files: FILES, ended: null })
    expect(home.sent).toEqual(["GET /leetype/session-files"])
    expect(home.via).toEqual(["look"])
  })

  it("says how a look that brought nothing ended, and answers what was read last", async () => {
    const { home, reads } = readsOf()
    await reads.list()
    home.answer = (): Promise<HomeAnswer> =>
      Promise.resolve({ status: 429, body: "" })
    await expect(reads.list()).resolves.toEqual({
      files: FILES,
      ended: "busy",
    })
    home.answer = (): Promise<HomeAnswer> =>
      Promise.resolve({ status: 401, body: "" })
    await expect(reads.list()).resolves.toMatchObject({ ended: "forgotten" })
    home.answer = (): Promise<HomeAnswer> => Promise.reject(new TypeError("x"))
    await expect(reads.list()).resolves.toMatchObject({ ended: "failed" })
  })
})

describe("fetching one of home's session files", () => {
  it("asks for the file by its name, on a tap, and names each way it ends", async () => {
    const { home, reads } = readsOf({
      answer: () => Promise.resolve({ status: 200, body: "{}" }),
    })
    await expect(reads.fetch("t1-01 a.json")).resolves.toEqual({
      kind: "file",
      body: "{}",
    })
    expect(home.sent).toEqual(["GET /leetype/session-files/t1-01%20a.json"])
    expect(home.via).toEqual(["tap"])

    const ends: Array<[number, string]> = [
      [404, "gone"],
      [401, "forgotten"],
      [429, "busy"],
      [500, "failed"],
    ]
    for (const [status, kind] of ends) {
      home.answer = (): Promise<HomeAnswer> =>
        Promise.resolve({ status, body: "" })
      await expect(reads.fetch("a.json")).resolves.toEqual({ kind })
    }
  })

  it("sends nothing unpaired or in the background", async () => {
    const { home, reads } = readsOf({ pairing: null })
    await expect(reads.fetch("a.json")).resolves.toEqual({
      kind: "unreachable",
    })
    home.pairing = "pairing-1"
    home.visible = false
    await expect(reads.fetch("a.json")).resolves.toEqual({
      kind: "unreachable",
    })
    expect(home.sent).toEqual([])
  })

  it("never rejects when the phone faults", async () => {
    const { reads } = readsOf({
      answer: () => Promise.reject(new TypeError("boom")),
    })
    await expect(reads.fetch("a.json")).resolves.toEqual({ kind: "failed" })
  })
})
