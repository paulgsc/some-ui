/**
 * The phone's id for each voice note a decisions or scouts file names
 * (`notes`): how the run finds home's transcript of it (ROUTINE.md §2). A
 * file from before it carries none and still reads, and a name or an id the
 * run couldn't match a transcript by is refused.
 */
import { parseDecisions } from "@job-desk/decisions"
import { parseScouts } from "@job-desk/scouts"
import { describe, expect, it } from "vitest"

const decisions = (extra: object): string =>
  JSON.stringify({
    schema: "some-ui.job-decisions/1",
    day: "2026-10-26",
    digestDay: "2026-10-26",
    sharedAt: "2026-10-26T08:00:00.000Z",
    picks: [],
    disagreements: [],
    outcomes: [],
    ...extra,
  })

const scouts = (extra: object): string =>
  JSON.stringify({
    schema: "some-ui.job-scouts/1",
    sharedAt: "2026-10-26T08:00:00.000Z",
    scouts: [
      {
        id: "sc-a1b2c3",
        url: "https://www.indeed.com/viewjob?jk=1",
        title: "SRE · Somewhere",
        why: "",
        postingText: null,
        voice: ["sc-a1b2c3_voice-1.webm"],
        addedAt: "2026-10-26T07:00:00.000Z",
        track: "software",
        family: null,
      },
    ],
    ...extra,
  })

describe("each voice note's id in a shared file", () => {
  it("reads a file from before it as naming none", () => {
    expect(parseDecisions(decisions({}))).toMatchObject({
      ok: true,
      value: { notes: {} },
    })
    expect(parseScouts(scouts({}))).toMatchObject({
      ok: true,
      value: { notes: {} },
    })
  })

  it("keeps each note's id by its file name", () => {
    const notes = {
      "sc-a1b2c3_voice-1.webm": "0b6f0f8e-1f2a-4c55-9d7e-3a1b2c3d4e5f",
    }
    expect(parseScouts(scouts({ notes }))).toMatchObject({
      ok: true,
      value: { notes },
    })
  })

  it("refuses a name that isn't a voice file, or an id home wouldn't keep", () => {
    for (const notes of [
      { "notes.txt": "n1" },
      { "x_voice-1.webm": "an id/with a slash" },
      { "x_voice-1.webm": "" },
    ]) {
      expect(parseDecisions(decisions({ notes })).ok).toBe(false)
    }
  })
})
