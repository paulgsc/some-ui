/**
 * What each voice note is told home as (`../voice-copy`, LA13): a spoken
 * reflection by its session, and a Jobs note by the first event that names
 * it, with times that never move between tries (home takes a replay only as
 * it was first described), never one let go once its share arrived in
 * Drive; a scene note as the drama's next scene, by when it was kept; a game
 * bite by its game, with every field it keeps; and what this phone can't
 * send, by why (LA14).
 */
import { describe, expect, it } from "vitest"

import {
  gameNote,
  ideaNote,
  jobsNotes,
  leetypeNote,
  lensNote,
  reflectionNote,
  refOf,
  sceneNote,
  soundbiteNote,
  unsendable,
} from "@/lib/home-link/voice-copy"
import type { JobEvent, JobsState, VoiceNote } from "@/lib/jobs/model"
import { EMPTY } from "@/lib/jobs/model"
import { NO_PASS } from "@/lib/voice-home/model"

const PICK = { day: "2026-10-25", pickId: "acme-sre", fingerprint: "f" }
const voice = (id: string, owner = "draft"): VoiceNote => ({
  id,
  mimeType: "audio/webm",
  durationMs: 1000,
  owner,
})

describe("what each voice note is told home as", () => {
  it("tells a soundbite by how it came to be recorded, a lens take by its line and a LeetType take by its file and screen (HF5)", () => {
    const takenAt = Date.parse("2026-11-01T09:12:00.000Z")
    const take = { id: "t1", takenAt, durationMs: 3000, mimeType: "audio/webm" }
    expect(lensNote({ ...take, line: "two-cups" })).toEqual({
      id: "t1",
      of: "lens",
      ref: "two-cups",
      at: "2026-11-01T09:12:00.000Z",
      contentType: "audio/webm",
    })
    expect(leetypeNote({ ...take, line: "two-sum.json#explain-1" }).ref).toBe(
      "two-sum.json:explain-1"
    )
    // MIC10: an idea answer's take goes as a Studio note, by what it answers.
    expect(ideaNote({ ...take, line: "idea:3f2a-9c:takeaway" })).toEqual({
      id: "t1",
      of: "studio",
      ref: "idea:3f2a-9c:takeaway",
      at: "2026-11-01T09:12:00.000Z",
      contentType: "audio/webm",
    })
    expect(
      soundbiteNote({
        id: "b1",
        recordedAt: "2026-11-01T09:00:00.000Z",
        durationMs: 5000,
        mimeType: "audio/webm;codecs=opus",
        bytes: 9,
        context: {
          source: "reminder",
          lastSessionAt: null,
          openSessions: 0,
          timeZone: "UTC",
        },
      })
    ).toEqual({
      id: "b1",
      of: "soundbite",
      ref: "reminder",
      at: "2026-11-01T09:00:00.000Z",
      contentType: "audio/webm;codecs=opus",
    })
  })

  it("makes any line a ref home takes", () => {
    expect(refOf("a line/with spaces#and more")).toBe(
      "a-line-with-spaces-and-more"
    )
    expect(refOf("x".repeat(300))).toHaveLength(200)
    expect(refOf("")).toBe("-")
    expect(refOf("ok_line.v2:s3-1")).toBe("ok_line.v2:s3-1")
  })

  it("tells a scene note as the drama's next scene, by when it was kept, recorded and never shared", () => {
    const now = new Date("2026-10-31T12:00:00.000Z")
    const kept = { id: "s1", durationMs: 4000, mimeType: "audio/mp4" }
    expect(sceneNote({ ...kept, at: "2026-10-30T20:00:00.000Z" }, now)).toEqual(
      {
        id: "s1",
        of: "scene",
        ref: "next-scene",
        at: "2026-10-30T20:00:00.000Z",
        contentType: "audio/mp4",
      }
    )
    // Kept before the phone noted when: told home as of now.
    expect(sceneNote(kept, now).at).toBe("2026-10-31T12:00:00.000Z")
  })

  it("tells a game bite by its game and when it was kept, with every field it keeps", () => {
    const fields = { how: "said-first", strip: "", watching: "1" }
    expect(
      gameNote({
        id: "b1",
        gameId: "401772981",
        at: "2026-11-01T21:00:05.000Z",
        contentType: "audio/webm;codecs=opus",
        durationMs: 4000,
        fields,
        holdUntil: 0,
      })
    ).toEqual({
      id: "b1",
      of: "game",
      ref: "401772981",
      at: "2026-11-01T21:00:05.000Z",
      contentType: "audio/webm;codecs=opus",
      fields,
    })
  })

  it("tells a spoken reflection by its session and when it was said, and a written one not at all", () => {
    const spoken = {
      id: "r1",
      sessionId: "session-7f2a",
      createdAt: "2026-10-25T03:10:00.000Z",
      atMs: 1200,
      body: {
        kind: "voice" as const,
        durationMs: 3000,
        mimeType: "audio/mp4",
        bytes: 9,
      },
    }
    expect(reflectionNote(spoken)).toEqual({
      id: "r1",
      of: "reflection",
      ref: "session-7f2a",
      at: "2026-10-25T03:10:00.000Z",
      contentType: "audio/mp4",
    })
    expect(
      reflectionNote({ ...spoken, body: { kind: "text", text: "slow" } })
    ).toBeNull()
  })

  it("tells a Jobs note by the first pick or scout event naming it, and leaves out a draft's and one let go", () => {
    const log: Array<JobEvent> = [
      {
        id: "e1",
        at: "2026-10-25T08:00:00.000Z",
        type: "passed",
        reasons: [],
        note: "",
        voice: ["v1"],
        ...PICK,
      },
      {
        id: "e2",
        at: "2026-10-25T09:00:00.000Z",
        type: "scout",
        scout: {
          id: "sc-1a2b3c4d",
          url: "https://example.com/job",
          title: "SRE",
          why: "",
          postingText: null,
          track: "software",
          family: null,
        },
        voice: ["v2", "gone"],
      },
      {
        id: "e3",
        at: "2026-10-25T10:00:00.000Z",
        type: "shared",
        kind: "decisions",
        day: "2026-10-25",
        file: "decisions-2026-10-25.json",
        through: 2,
        voice: ["v1", "v2"],
      },
      {
        id: "e4",
        at: "2026-10-25T11:00:00.000Z",
        type: "debrief",
        minutes: null,
        friction: null,
        chips: [],
        what: "",
        voice: ["v1"],
        result: "submitted",
        ...PICK,
      },
    ]
    const state = (events: ReadonlyArray<JobEvent>): JobsState => ({
      ...EMPTY,
      log: events,
      voice: [voice("v1"), voice("v2"), voice("draft-only")],
    })
    expect(jobsNotes(state(log))).toEqual([
      {
        id: "v1",
        of: "jobs",
        ref: "2026-10-25:acme-sre",
        at: "2026-10-25T08:00:00.000Z",
        contentType: "audio/webm",
      },
      {
        id: "v2",
        of: "jobs",
        ref: "sc-1a2b3c4d",
        at: "2026-10-25T09:00:00.000Z",
        contentType: "audio/webm",
      },
    ])
  })

  it("leaves out a Jobs note let go once its share arrived, and counts it as in Drive until home has a copy", () => {
    const log: Array<JobEvent> = [
      {
        id: "e1",
        at: "2026-10-25T08:00:00.000Z",
        type: "passed",
        reasons: [],
        note: "",
        voice: ["v1"],
        ...PICK,
      },
      {
        id: "e2",
        at: "2026-10-25T09:00:00.000Z",
        type: "scout",
        scout: {
          id: "sc-1a2b3c4d",
          url: "https://example.com/job",
          title: "SRE",
          why: "",
          postingText: null,
          track: "software",
          family: null,
        },
        voice: ["v2"],
      },
      {
        id: "e3",
        at: "2026-10-25T10:00:00.000Z",
        type: "shared",
        kind: "decisions",
        day: "2026-10-25",
        file: "decisions-2026-10-25.json",
        through: 2,
        voice: ["v1"],
      },
    ]
    const arrived: JobEvent = {
      id: "e4",
      at: "2026-10-25T11:00:00.000Z",
      type: "arrived",
      shareId: "e3",
    }
    const state = (events: ReadonlyArray<JobEvent>): JobsState => ({
      ...EMPTY,
      log: events,
      voice: [voice("v1"), voice("v2")],
    })
    // Shared, not yet arrived: its audio is still on the phone.
    expect(jobsNotes(state(log)).map((n) => n.id)).toEqual(["v1", "v2"])
    // Arrived in Drive: a copy, so the note is still offered home (LG1).
    const after = state([...log, arrived])
    expect(jobsNotes(after).map((n) => n.id)).toEqual(["v1", "v2"])

    const none = (): boolean => false
    expect(unsendable(NO_PASS, none)).toEqual({ gone: 0 })
    const pass = { ...NO_PASS, gone: new Set(["r1", "r2"]) }
    expect(unsendable(pass, (id) => id === "r2")).toEqual({
      gone: 1,
    })
  })

  it("sends a form's note filed out of its draft home under the event that recorded the form (#2443)", () => {
    const state: JobsState = {
      ...EMPTY,
      voice: [
        {
          id: "aside",
          mimeType: "audio/webm",
          durationMs: 2_000,
          owner: "2026-10-25/acme/pass",
          standing: "set-aside",
          filed: { ref: "2026-10-25:acme", at: "2026-10-25T09:00:00.000Z" },
        },
        {
          id: "draft",
          mimeType: "audio/webm",
          durationMs: 2_000,
          owner: "2026-10-25/acme/pass",
          standing: "set-aside",
        },
      ],
    }
    expect(jobsNotes(state)).toEqual([
      {
        id: "aside",
        of: "jobs",
        ref: "2026-10-25:acme",
        at: "2026-10-25T09:00:00.000Z",
        contentType: "audio/webm",
      },
    ])
  })
})
