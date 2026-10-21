/**
 * @vitest-environment jsdom
 */

import { sessionRecord } from "@/test-support/session-record"
import { seedStop, stopRecord } from "@/test-support/session-stop"
import type { Soundbite } from "@some-ui/soundbites"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  arrivals,
  handOff,
  handOffExport,
  shareAgentExport,
  shareReflections,
} from "@/lib/agent-export"
import type { Reflection } from "@/lib/session-reflection"
import { reflections } from "@/lib/session-reflection"
import { storeEffect } from "@/lib/session-stop"

const written = vi.hoisted(() => new Map<string, string>())
const share = vi.hoisted(() => vi.fn())
const removedAudio = vi.hoisted(() => vi.fn())
const audioRead = vi.hoisted(() => ({ fails: false }))

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
const PRACTICE = vi.hoisted(() => ({
  version: 1,
  days: [{ day: "2026-10-10", reps: 30, sets: 3, practiceMs: 270_000 }],
  totals: { reps: 30, sets: 3, practiceMs: 270_000 },
}))
const FEEDBACK = vi.hoisted(() => ({
  tooEasy: null,
  tooManyRepeats: { at: "2026-10-10T09:00:00.000Z" },
}))
const LENS = vi.hoisted(() => ({
  entries: [{ session: "2026-10-10T08:00:00.000Z", line: "school-bus" }],
  sessions: [{ session: "2026-10-10T08:00:00.000Z", racing: false }],
}))
const letGoLensRecord = vi.hoisted(() => vi.fn(() => 1))
/** Which lens store each export read, in order. */
const lensReads = vi.hoisted((): Array<string> => [])
vi.mock("@some-ui/topik", () => ({
  readAloudPracticeRecord: (): typeof PRACTICE => PRACTICE,
  readAloudFeedbackForExport: (): typeof FEEDBACK => FEEDBACK,
  lensRecordForExport: (): typeof LENS => {
    lensReads.push("record")
    return LENS
  },
  letGoLensRecord,
}))
const TAKE = {
  line: "school-bus",
  takenAt: 1_760_000_000_000,
  durationMs: 2_500,
  mimeType: "audio/webm",
}
const letGoLensTakes = vi.hoisted(() => vi.fn())
vi.mock("@/lib/lens-takes", () => ({
  letGoLensTakes,
  lensTakesForExport: (): Promise<Array<unknown>> => {
    lensReads.push("takes")
    return Promise.resolve([
      {
        take: { ...TAKE, id: "take-one-aaaa" },
        audio: new Blob(["opus"]),
        read: true,
      },
      { take: { ...TAKE, id: "take-two-bbbb" }, audio: null, read: true },
      // The shelf failed: listed without a file, and never let go.
      { take: { ...TAKE, id: "take-three-cc" }, audio: null, read: false },
      // A long line id: its file name is cut short, its entry keeps it whole.
      {
        take: { ...TAKE, line: "x".repeat(300), id: "take-four-dddd" },
        audio: new Blob(["opus"]),
        read: true,
      },
    ])
  },
}))
const letGoLeetypeTakes = vi.hoisted(() => vi.fn())
const NOTE = {
  file: "t1-01",
  screen: "s15",
  prompt: "Tell it to a colleague.",
  rubric: ["one", "two"],
  ticks: ["one"],
  notedAt: 1_760_000_000_000,
}
vi.mock("@/lib/leetype-takes", () => ({
  letGoLeetypeTakes,
  leetypeTakesForExport: (): Promise<unknown> =>
    Promise.resolve({
      notes: [
        { ...NOTE, id: "note-aloud", take: "lt-take-1111", typed: null },
        { ...NOTE, id: "note-typed", take: null, typed: "on the bus" },
      ],
      takes: [
        {
          take: { ...TAKE, line: "t1-01#s15", id: "lt-take-1111" },
          audio: new Blob(["opus"]),
          read: true,
        },
      ],
    }),
}))
vi.mock("@/lib/tenant/queries", () => ({
  sessionsRepository: {
    list: (): Promise<Array<unknown>> =>
      Promise.resolve([
        sessionRecord({
          id: "s1-0000000000",
          name: "Morning Drama",
          status: "completed",
          completedAt: "2026-10-10T09:00:00.000Z",
          layout: undefined,
        }),
      ]),
  },
}))
vi.mock("@/lib/reflection-voice", async () => {
  const { reflections: store } = await import("@/lib/session-reflection")
  return {
    reflectionAudio: (): { get: (id: string) => Promise<Blob | null> } => ({
      get: (id: string): Promise<Blob | null> =>
        audioRead.fails
          ? Promise.reject(new Error("IndexedDB unavailable"))
          : Promise.resolve(id === "v1" ? new Blob(["opus"]) : null),
    }),
    letGoReflections: (ids: ReadonlyArray<string>): boolean => {
      if (!store.letGo(ids)) return false
      removedAudio(ids)
      return true
    },
    isSaving: (): boolean => false,
  }
})

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

function reflection(
  id: string,
  sessionId: string,
  body: Reflection["body"],
  atMs: number | null = 252_000,
  createdAt = "2026-10-10T09:00:00.000Z"
): Reflection {
  return { id, sessionId, createdAt, atMs, body }
}

const NOW = (): Date => new Date("2026-10-11T00:00:00Z")

beforeEach(() => {
  // A failure is reported (`reportFailure`); the console line is not under test.
  vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
  localStorage.clear()
  reflections.letGo(reflections.getSnapshot().kept.map((r) => r.id))
  for (const batch of arrivals.getSnapshot()) arrivals.answer(batch, false)
  written.clear()
  removedAudio.mockReset()
  audioRead.fails = false
  share.mockReset().mockResolvedValue({})
  reflections.keep(
    reflection("v1", "s1-0000000000", {
      kind: "voice",
      durationMs: 18_000,
      mimeType: "audio/webm;codecs=opus",
      bytes: 4,
    })
  )
  reflections.keep(
    reflection(
      "t1",
      "s1-0000000000",
      { kind: "text", text: "particles" },
      null,
      "2026-10-10T09:30:00.000Z"
    )
  )
  reflections.keep(
    reflection("t2", "gone-session", { kind: "text", text: "orphan" })
  )
})

describe("shareReflections", () => {
  it("shares one file per session named for it, its voice notes beside it, and keeps them until handed off", async () => {
    seedStop(stopRecord(0, { sessionId: "s1-0000000000", reason: "break" }))
    seedStop(stopRecord(0, { sessionId: "another-session" }))
    storeEffect({ kind: "count", sessionId: "s1-0000000000", path: "glances" })
    await expect(
      shareReflections({ sessionIds: ["s1-0000000000"] }, NOW)
    ).resolves.toEqual({
      outcome: "shared",
      sent: ["v1", "t1"],
    })

    const base = "reflections/2026-10-10_morning-drama_s1-00000"
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          `file:///cache/${base}.json`,
          `file:///cache/${base}_voice-04m12s-v1.webm`,
        ],
      })
    )
    expect(JSON.parse(written.get(`${base}.json`) ?? "null")).toMatchObject({
      session: { id: "s1-0000000000", name: "Morning Drama" },
      reflections: [
        {
          id: "v1",
          kind: "voice",
          atMs: 252_000,
          file: "2026-10-10_morning-drama_s1-00000_voice-04m12s-v1.webm",
        },
        { id: "t1", kind: "text", text: "particles", atMs: null },
      ],
      stops: [{ sessionId: "s1-0000000000", reason: "break", via: "left" }],
      paths: { glances: 1, opens: 0 },
      readAloudPractice: PRACTICE,
      readAloudFeedback: FEEDBACK,
    })
    // Android says "shared" once an app is picked: nothing goes on that.
    expect(reflections.getSnapshot().kept).toHaveLength(3)

    handOff(["v1", "t1"], NOW())
    expect(reflections.getSnapshot().kept.map((r) => r.id)).toEqual(["t2"])
    expect(removedAudio).toHaveBeenCalledWith(["v1", "t1"])
    expect(reflections.getSnapshot().shared).toEqual([
      { sessionId: "s1-0000000000", sharedAt: NOW().toISOString() },
    ])
  })

  it("shares one reflection of a session under the session's own file name, and once it arrived a later share carries only the rest", async () => {
    const base = "reflections/2026-10-10_morning-drama_s1-00000"
    const reflectionsIn = (): unknown =>
      JSON.parse(written.get(`${base}.json`) ?? "null").reflections

    await shareReflections({ sessionIds: ["s1-0000000000"], only: ["v1"] }, NOW)

    expect(share).toHaveBeenLastCalledWith(
      expect.objectContaining({
        files: [
          `file:///cache/${base}.json`,
          `file:///cache/${base}_voice-04m12s-v1.webm`,
        ],
      })
    )
    expect(reflectionsIn()).toEqual([expect.objectContaining({ id: "v1" })])

    const [batch] = arrivals.getSnapshot()
    expect(batch).toEqual(["v1"])
    arrivals.answer(batch, true, NOW())
    expect(arrivals.getSnapshot()).toEqual([])
    await shareReflections({ sessionIds: ["s1-0000000000"] }, NOW)
    expect(reflectionsIn()).toEqual([expect.objectContaining({ id: "t1" })])
  })

  it("keeps a share the person says did not arrive, and waits on none backed out of", async () => {
    await shareReflections({ sessionIds: ["s1-0000000000"] }, NOW)
    const [batch] = arrivals.getSnapshot()
    arrivals.answer(batch, false)
    arrivals.answer(batch, true)

    expect(arrivals.getSnapshot()).toEqual([])
    expect(reflections.getSnapshot().kept).toHaveLength(3)

    share.mockRejectedValue(new Error("Share canceled"))
    await shareReflections({ sessionIds: ["s1-0000000000"] }, NOW)
    expect(arrivals.getSnapshot()).toEqual([])
  })

  it("marks nothing shared when the phone would not store the hand-off", () => {
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === "some-ui:reflections") throw new DOMException("full")
      setItem.call(this, key, value)
    })

    handOff(["v1", "t1"], NOW())
    vi.restoreAllMocks()

    expect(reflections.getSnapshot().kept).toHaveLength(3)
    expect(removedAudio).not.toHaveBeenCalled()
    expect(reflections.getSnapshot().shared).toEqual([])
  })

  it("leaves out a voice note whose audio could not be read, so it stays", async () => {
    audioRead.fails = true

    const { sent } = await shareReflections(
      { sessionIds: ["s1-0000000000"] },
      NOW
    )

    expect(sent).toEqual(["t1"])
    expect(
      JSON.parse(
        written.get("reflections/2026-10-10_morning-drama_s1-00000.json") ??
          "null"
      )
    ).toMatchObject({ reflections: [{ id: "t1" }] })
  })

  it("says cancelled when the share sheet is backed out of", async () => {
    share.mockRejectedValue(new Error("Share canceled"))

    await expect(
      shareReflections({ sessionIds: ["s1-0000000000"] }, NOW)
    ).resolves.toMatchObject({ outcome: "cancelled" })
  })
})

describe("shareAgentExport", () => {
  it("shares context.json with each session's reflections nested, and every recording, keeping them until handed off", async () => {
    seedStop(stopRecord(0, { reason: "focus", outcome: "done" }))
    storeEffect({ kind: "count", sessionId: "s1-0000000000", path: "opens" })
    storeEffect({ kind: "count", sessionId: "gone-session", path: "glances" })
    const { createSessionLogStore } = await import("@some-ui/leetype")
    const log = createSessionLogStore()
    const stamp = { session: "lt-1", at: "2026-10-10T10:00:00.000Z" }
    log.append({
      ...stamp,
      id: "lt-e1",
      type: "started",
      file: "t1-01",
      form: "full",
      declaredMinutes: 10,
    })
    log.append({
      ...stamp,
      id: "lt-e2",
      type: "picked",
      file: "t1-01",
      screen: "r1",
      option: "Reply only after fsync",
      ms: 8000,
      answer: { response: "correct", slow: false },
    })
    localStorage.setItem("leetype:ledger", '{"v":3,"rounds":[]}')

    const result = await shareAgentExport(soundbites, NOW)
    const { sent } = result

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          "file:///cache/agent-export/context.json",
          "file:///cache/agent-export/soundbite-b1.webm",
          "file:///cache/agent-export/lens-take-school-bus-take-one.webm",
          `file:///cache/agent-export/lens-take-${"x".repeat(48)}-take-fou.webm`,
          "file:///cache/agent-export/leetype-take-t1-01-s15-lt-take-.webm",
          "file:///cache/agent-export/2026-10-10_morning-drama_s1-00000_voice-04m12s-v1.webm",
        ],
      })
    )
    const context: unknown = JSON.parse(
      written.get("agent-export/context.json") ?? "null"
    )
    expect(context).toMatchObject({
      exportedAt: "2026-10-11T00:00:00.000Z",
      sessions: [
        {
          id: "s1-0000000000",
          reflections: [{ id: "v1" }, { id: "t1", text: "particles" }],
          paths: { opens: 1 },
        },
      ],
      reflectionsWithoutSession: [{ sessionId: "gone-session", id: "t2" }],
      pathsWithoutSession: [{ sessionId: "gone-session", glances: 1 }],
      stops: [{ sessionId: "session-1", reason: "focus" }],
      readAloudPractice: PRACTICE,
      readAloudFeedback: FEEDBACK,
      grammarLens: LENS,
      // A take whose audio could not be read is listed without a file.
      lensTakes: [
        { id: "take-one-aaaa", file: "lens-take-school-bus-take-one.webm" },
        { id: "take-two-bbbb", file: null },
        { id: "take-three-cc", file: null },
        {
          id: "take-four-dddd",
          line: "x".repeat(300),
          file: `lens-take-${"x".repeat(48)}-take-fou.webm`,
        },
      ],
      leetypeAnswers: [
        {
          id: "note-aloud",
          file: "t1-01",
          ticks: ["one"],
          audio: "leetype-take-t1-01-s15-lt-take-.webm",
        },
        { id: "note-typed", typed: "on the bus", audio: null },
      ],
      leetypeTakes: [
        { id: "lt-take-1111", audio: "leetype-take-t1-01-s15-lt-take-.webm" },
      ],
      // How each session went, and none of its events (#1923).
      leetypeSessions: [
        {
          session: "lt-1",
          file: "t1-01",
          ended: null,
          rounds: [{ screen: "r1", picked: "correct", solved: true }],
        },
      ],
      leetypeRoundLedger: { v: 3, rounds: [] },
      soundbites: [{ id: "b1", file: "soundbite-b1.webm" }],
    })
    expect(context).not.toHaveProperty(["leetypeSessions", 0, "events"])
    expect(context).not.toHaveProperty(["sessions", 0, "scenes"])
    expect(sent).toEqual(["t2", "v1", "t1"])
    expect(result.soundbites).toEqual(["b1"])
    expect(result.lens).toEqual(LENS.entries)
    expect(result.takes).toEqual([
      "take-one-aaaa",
      "take-two-bbbb",
      "take-four-dddd",
    ])
    // The record first: a take kept in between stays with its rewritten entry.
    expect(lensReads.slice(-2)).toEqual(["record", "takes"])

    const remove = vi.fn(() => Promise.resolve())
    handOffExport({ remove }, result, NOW())
    expect(reflections.getSnapshot().kept).toEqual([])
    expect(remove).toHaveBeenCalledWith(["b1"])
    expect(letGoLensTakes).toHaveBeenCalledWith([
      "take-one-aaaa",
      "take-two-bbbb",
      "take-four-dddd",
    ])
    expect(letGoLeetypeTakes).toHaveBeenCalledWith({
      notes: ["note-aloud", "note-typed"],
      takes: ["lt-take-1111"],
    })
    await vi.waitFor(() => {
      expect(letGoLensRecord).toHaveBeenCalledWith(LENS.entries)
    })
  })

  it("hands off soundbites alone when no reflection went out", async () => {
    reflections.letGo(["v1", "t1", "t2"])
    const result = await shareAgentExport(soundbites, NOW)
    expect(result).toMatchObject({ sent: [], soundbites: ["b1"] })
    expect(
      JSON.parse(written.get("agent-export/context.json") ?? "null")
    ).toMatchObject({ leetypeSessions: [], leetypeRoundLedger: null })

    const remove = vi.fn(() => Promise.reject(new Error("busy")))
    // A refused remove is swallowed: vitest fails the run on an unhandled one.
    handOffExport({ remove }, result, NOW())
    expect(remove).toHaveBeenCalledWith(["b1"])
  })

  it("names no file for a recording whose audio is gone", async () => {
    await shareAgentExport({
      ...soundbites,
      audio: (): Promise<null> => Promise.resolve(null),
    })

    expect(
      JSON.parse(written.get("agent-export/context.json") ?? "null")
    ).toMatchObject({ soundbites: [{ id: "b1", file: null }] })
  })
})
