/**
 * What each voice note is told home as (`../voice-copy`, LA13): a spoken
 * reflection by its session, a Jobs note by the first event that names it,
 * and a scene note by its drama prompt's stamp, with times that never move
 * between tries (home takes a replay only as it was first described).
 */
import { describe, expect, it } from "vitest"

import { jobsNotes, promptOf, reflectionNote } from "@/lib/home-link/voice-copy"
import type { JobEvent, VoiceNote } from "@/lib/jobs/model"

const PICK = { day: "2026-10-25", pickId: "acme-sre", fingerprint: "f" }
const voice = (id: string, owner = "draft"): VoiceNote => ({
  id,
  mimeType: "audio/webm",
  durationMs: 1000,
  owner,
})

describe("what each voice note is told home as", () => {
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
    expect(
      jobsNotes(log, [voice("v1"), voice("v2"), voice("draft-only")])
    ).toEqual([
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

  it("reads a drama prompt's stamp, and when it was made, from its file's name", () => {
    expect(promptOf("drama-20261009T070503120Z.prompt.md")).toEqual({
      stamp: "drama-20261009T070503120Z",
      at: "2026-10-09T07:05:03.120Z",
    })
    for (const name of [
      "drama-20261009T070503120Z.voice-1.webm",
      "drama-1.prompt.md",
      "scene-20261009T070503120Z.prompt.md",
    ]) {
      expect([name, promptOf(name)]).toEqual([name, null])
    }
  })
})
