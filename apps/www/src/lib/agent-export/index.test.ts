/**
 * @vitest-environment jsdom
 */

import { sessionRecord } from "@/test-support/session-record"
import { seedStop, stopRecord } from "@/test-support/session-stop"
import type { Soundbite } from "@some-ui/soundbites"
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

const bite: Soundbite = {
  id: "b1",
  recordedAt: "2026-10-01T08:00:00.000Z",
  durationMs: 4000,
  mimeType: "audio/webm;codecs=opus",
  bytes: 4,
  context: {
    source: "reminder",
    lastSessionAt: null,
    openSessions: 0,
    timeZone: "Asia/Seoul",
  },
}
const soundbites = {
  list: (): Promise<Array<typeof bite>> => Promise.resolve([bite]),
  audio: (): Promise<Blob> =>
    Promise.resolve(new Blob(["opus"], { type: bite.mimeType })),
}

beforeEach(() => {
  // A failure is reported (`reportFailure`); the console line is not under test.
  vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
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
    expect(context).not.toHaveProperty(["sessions", 0, "scenes"])
  })

  it("names no file for a soundbite whose audio is gone", async () => {
    await shareAgentExport({
      ...soundbites,
      audio: (): Promise<null> => Promise.resolve(null),
    })

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: ["file:///cache/agent-export/context.json"],
      })
    )
    expect(
      JSON.parse(written.get("agent-export/context.json") ?? "null")
    ).toMatchObject({ soundbites: [{ id: "b1", file: null }] })
  })
})
