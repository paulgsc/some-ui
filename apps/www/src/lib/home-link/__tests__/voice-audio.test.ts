/**
 * @vitest-environment node
 *
 * A Rust Rounds note's audio back from home (RR6, the owner's D4;
 * `GET /voice-notes/:id/audio`): one GET by the note's id, the bytes played
 * only when they hash to home's SHA-256, and none for anything else.
 */
import type { HomeAnswer, HomeCall } from "@some-ui/core-utils"
import { sha256Hex } from "@some-ui/core-utils"
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

const { askAudio, audioPath, readAudio } = await import(
  "@/lib/home-link/voice-audio"
)

const BYTES = new TextEncoder().encode("opus frames")
const SHA256 = await sha256Hex(BYTES.buffer)

const held = (overrides: Record<string, unknown> = {}): HomeAnswer => ({
  status: 200,
  body: JSON.stringify({
    id: "r1",
    contentType: "audio/webm",
    sha256: SHA256,
    audio: btoa(String.fromCharCode(...BYTES)),
    ...overrides,
  }),
})

beforeEach(() => {
  pairedNow = true
  answer = { status: 404, body: "" }
  asked.length = 0
})

describe("a note's audio back from home (RR6)", () => {
  it("reads the note's bytes, its container and home's hash, and nothing from any other answer", () => {
    expect(readAudio(held(), "r1")).toEqual({
      contentType: "audio/webm",
      bytes: BYTES,
      sha256: SHA256,
    })
    for (const other of [
      { status: 404, body: "" },
      { status: 304, body: "" },
      { status: 200, body: "not json" },
      held({ id: "r2" }),
      held({ sha256: "abc" }),
      held({ audio: "%%%" }),
    ]) {
      expect(readAudio(other, "r1")).toBeNull()
    }
  })

  it("asks once, by the note's id, and plays only bytes that hash to home's", async () => {
    answer = held()
    const blob = await askAudio("r1")
    expect(asked).toEqual([["GET", "/voice-notes/r1/audio"]])
    expect(blob?.type).toBe("audio/webm")
    if (blob === null) throw new Error("home gave the note back")
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(BYTES)

    answer = held({ sha256: "0".repeat(64) })
    expect(await askAudio("r1")).toBeNull()
  })

  it("gives none when unpaired, busy, refused or unanswered, and never rejects", async () => {
    pairedNow = false
    expect(await askAudio("r1")).toBeNull()
    expect(asked).toEqual([])
    pairedNow = true
    answer = null
    expect(await askAudio("r1")).toBeNull()
    answer = { status: 404, body: "" }
    expect(await askAudio("r1")).toBeNull()
    answer = new Error("no answer")
    expect(await askAudio("r1")).toBeNull()
    expect(audioPath("a b")).toBe("/voice-notes/a%20b/audio")
  })
})
