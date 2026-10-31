import type { Round, RoundLog } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import { intakeReply } from "@rust-rounds/lib/intake"
import { copyForTutor } from "@rust-rounds/lib/tutor-copy"
import {
  INDEXING_01,
  INDEXING_01_NOTES,
  WORKED_LOG,
  WORKED_TRANSCRIPTS,
} from "@rust-rounds/lib/worked-example"
import { describe, expect, it } from "vitest"

const NO_LOG: RoundLog = { schema: LOG_SCHEMA, sessions: [] }

function transcript(note: string): string {
  const text = WORKED_TRANSCRIPTS.get(note)
  if (text === undefined) throw new Error("the worked example changed shape")
  return text
}

const copy = copyForTutor({
  log: WORKED_LOG,
  rounds: [INDEXING_01],
  notes: INDEXING_01_NOTES,
  transcripts: WORKED_TRANSCRIPTS,
})

describe("copyForTutor", () => {
  it("carries the instructions, the formats and every schema tag", () => {
    expect(copy).toMatch(/^# Rust Rounds: the log, for a tutor\n/)
    expect(copy).toContain("\n## Rust Rounds: the tutor's instructions\n")
    expect(copy).toContain("\n### The round: `some-ui.rust-round/1`\n")
    for (const tag of [
      "some-ui.rust-round/1",
      "some-ui.rust-round-log/1",
      "some-ui.rust-tutor-notes/1",
    ]) {
      expect(copy).toContain(tag)
    }
  })

  it("holds a worked example the intake takes, as a reply would", () => {
    // The first round and notes in the copy are the worked example's, so a
    // chat that matches their shape writes a reply that parses.
    const intake = intakeReply(copy, NO_LOG)
    expect(intake).toMatchObject({
      ok: true,
      round: INDEXING_01,
      notes: INDEXING_01_NOTES,
    })
  })

  it("puts each card's program, pick, transcript and rustc's output in the log", () => {
    const log = copy.slice(copy.indexOf("## The log"))
    expect(log).toContain("#### indexing-01, card c (variant)")
    expect(log).toContain("    let c = &s[1..2];")
    expect(log).toContain('- Picked "Prints é".')
    expect(log).toContain(`- Said \`note-0003\`: "${transcript("note-0003")}"`)
    expect(log).toContain("end byte index 2 is not a char boundary")
    expect(log).toContain("- Your guess (panics) matched what rustc did.")
    expect(log).toContain("- Moved on before rustc's result was shown.")
    expect(log).toContain("- Pinned: indexing-01 card c.")
    expect(log).not.toMatch(/audio/i)
  })

  it("says a note is not transcribed yet, and shows a refine card's earlier take", () => {
    const refining: Round = {
      ...INDEXING_01,
      id: "indexing-02",
      cards: [
        {
          kind: "refine",
          id: "a",
          note: "note-0001",
          nudge: "rustc's message names a trait.",
          aim: "understand",
          say: "Say again why `s[r]` doesn't compile.",
        },
      ],
    }
    const [session] = WORKED_LOG.sessions
    const log: RoundLog = {
      ...WORKED_LOG,
      sessions: [
        {
          ...session!,
          cards: [
            {
              round: "indexing-02",
              card: "a",
              at: "2026-10-30T23:00:00Z",
              picked: null,
              note: "note-0004",
              skipped: false,
              rustc: null,
            },
          ],
        },
      ],
    }
    const text = copyForTutor({
      log,
      rounds: [refining],
      notes: null,
      transcripts: WORKED_TRANSCRIPTS,
    })
    expect(text).toContain("#### indexing-02, card a (refine)")
    expect(text).toContain(
      `- Refines \`note-0001\`: "${transcript("note-0001")}"`
    )
    expect(text).toContain("- Said `note-0004` (not transcribed yet)")
    expect(text).toContain("None yet: start them with your round.")
  })

  it("fences output longer than any backtick run in it", () => {
    const [session] = WORKED_LOG.sessions
    const [event] = session!.cards
    const log: RoundLog = {
      ...WORKED_LOG,
      sessions: [
        {
          ...session!,
          cards: [
            {
              ...event!,
              rustc: {
                outcome: "compile-error",
                toolchain: "1.97.0",
                code: null,
                stderr: "error: unknown start of token: `\n```\n",
                span: null,
              },
            },
          ],
        },
      ],
    }
    const text = copyForTutor({
      log,
      rounds: [INDEXING_01],
      notes: null,
      transcripts: new Map(),
    })
    expect(text).toContain("does not compile (no error code).\n\n````text\n")
  })

  it("says when nothing was played", () => {
    const text = copyForTutor({
      log: NO_LOG,
      rounds: [],
      notes: null,
      transcripts: new Map(),
    })
    expect(text.trimEnd()).toMatch(/## The log\n\nNothing played yet\.$/)
  })
})
