/**
 * @vitest-environment jsdom
 */

import { sessionRecord } from "@/test-support/session-record"
import { seedStop, stopRecord } from "@/test-support/session-stop"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { shareAgentExport } from "@/lib/agent-export"
import { writeReflection } from "@/lib/session-reflection"

const written = vi.hoisted(() => new Map<string, string>())
const share = vi.hoisted(() => vi.fn())

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    rmdir: (): Promise<never> => Promise.reject(new Error("no such directory")),
    writeFile: ({
      path,
      data,
    }: {
      path: string
      data: string
    }): Promise<{ uri: string }> => {
      written.set(path, data)
      return Promise.resolve({ uri: `file:///cache/${path}` })
    },
  },
}))
vi.mock("@capacitor/share", () => ({ Share: { share } }))
vi.mock("@/lib/tenant/queries", () => ({
  sessionsRepository: {
    list: (): Promise<Array<unknown>> =>
      Promise.resolve([
        sessionRecord({ id: "s1", status: "completed", layout: undefined }),
      ]),
  },
}))

const bite = {
  id: "b1",
  recordedAt: "2026-10-01T08:00:00.000Z",
  mimeType: "audio/webm;codecs=opus",
  context: { source: "reminder" },
}
const soundbites = {
  list: (): Promise<Array<typeof bite>> => Promise.resolve([bite]),
  audio: (): Promise<Blob> =>
    Promise.resolve(new Blob(["opus"], { type: bite.mimeType })),
}

beforeEach(() => {
  localStorage.clear()
  written.clear()
  share.mockReset().mockResolvedValue({})
})

describe("shareAgentExport", () => {
  it("shares context.json and each soundbite's audio, named in the context", async () => {
    writeReflection("s1", { difficulty: "too-hard" })
    seedStop(stopRecord(0, { reason: "focus", outcome: "done" }))

    await shareAgentExport(soundbites, () => new Date("2026-10-07T00:00:00Z"))

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          "file:///cache/agent-export/context.json",
          "file:///cache/agent-export/soundbite-b1.webm",
        ],
      })
    )
    expect(written.get("agent-export/soundbite-b1.webm")).toBe(btoa("opus"))
    const context: unknown = JSON.parse(
      written.get("agent-export/context.json") ?? "null"
    )
    expect(context).toMatchObject({
      exportedAt: "2026-10-07T00:00:00.000Z",
      sessions: [{ id: "s1", status: "completed" }],
      reflections: [{ sessionId: "s1", answers: { difficulty: "too-hard" } }],
      stops: [{ sessionId: "session-1", reason: "focus" }],
      soundbites: [{ id: "b1", file: "soundbite-b1.webm" }],
    })
    // Playback wiring is left out: it says nothing about what was studied.
    expect(context).not.toHaveProperty(["sessions", 0, "scenes"])
  })

  it("treats backing out of the share sheet as done, and anything else as a failure", async () => {
    share.mockRejectedValueOnce(new Error("Share canceled"))
    await expect(shareAgentExport(soundbites)).resolves.toBeUndefined()

    share.mockRejectedValueOnce(
      new Error("Can't share while sharing is in progress")
    )
    await expect(shareAgentExport(soundbites)).rejects.toThrow("in progress")
  })
})
