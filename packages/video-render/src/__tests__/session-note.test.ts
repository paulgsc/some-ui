/**
 * A session's note (SFEED9): what `sessions/` in paulgsc/testing may hold,
 * and the reasons `render session-check` refuses a folder.
 */
import {
  parseSessionNote,
  SESSION_NOTE_SCHEMA,
  sessionFolderProblems,
} from "@video-render/session-note"
import { describe, expect, it } from "vitest"

const CALL = {
  title: "The frame's structure, not its picture",
  options: ["Draw the structure", "Wait for cards on the phone"],
  chose: 0,
  why: "The phone can't draw cards yet.",
  undo: "Draw each frame's picture once it can.",
}

const note = (over: object = {}): Record<string, unknown> => ({
  schema: SESSION_NOTE_SCHEMA,
  session: "session_01LDpdUKqLheeGPFB2nUiQfJ",
  ended: "2026-11-08",
  epics: ["SFEED"],
  pulls: [{ repo: "some-ui", kind: "pr", number: 2751 }],
  did: "Studio's Templates page now shows every frame of an episode before it is filled.",
  calls: [CALL],
  left: ["Command-line clips, which wait on the CARDS decisions."],
  waits: [{ repo: "some-ui", kind: "issue", number: 2676 }],
  ...over,
})

describe("a session's note", () => {
  it("refuses a call that chose an option it doesn't list", () => {
    const parsed = parseSessionNote(note({ calls: [{ ...CALL, chose: 2 }] }))
    expect(!parsed.ok && parsed.problems).toEqual([
      "calls.0: it chose an option it doesn't list",
    ])
  })
})

describe("a sessions folder", () => {
  it("is ready when each note parses under its own name", () => {
    const files = new Map([
      ["2026-11-08-session_01LDpdUKqLheeGPFB2nUiQfJ.json", note()],
    ])
    expect(sessionFolderProblems(files)).toEqual([])
  })

  it("names a file that holds another note", () => {
    const files = new Map([
      ["2026-11-07-session_01LDpdUKqLheeGPFB2nUiQfJ.json", note()],
    ])
    expect(sessionFolderProblems(files)).toEqual([
      "2026-11-07-session_01LDpdUKqLheeGPFB2nUiQfJ.json: it holds 2026-11-08-session_01LDpdUKqLheeGPFB2nUiQfJ.json",
    ])
  })
})
