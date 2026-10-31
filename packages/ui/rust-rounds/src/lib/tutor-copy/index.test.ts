import type { Round, RoundLog } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import { intakeReply } from "@rust-rounds/lib/intake"
import { copyForTutor } from "@rust-rounds/lib/tutor-copy"
import { INDEXING_01, INDEXING_01_NOTES } from "@rust-rounds/lib/worked-example"
import {
  WORKED_LOG,
  WORKED_TRANSCRIPTS,
} from "@rust-rounds/lib/worked-example/fixture"
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
  findings: [],
})

/** The copy's section under `heading`, up to the next heading of its level. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`)
  if (start === -1) throw new Error(`no section ${heading}`)
  const level = heading.slice(0, heading.indexOf(" "))
  const end = text.indexOf(`\n${level} `, start + heading.length + 2)
  return text.slice(start, end === -1 ? undefined : end)
}

const [session] = WORKED_LOG.sessions
if (session === undefined) throw new Error("the worked example changed shape")

describe("copyForTutor", () => {
  it("carries the instructions, one heading level down", () => {
    expect(copy).toMatch(/^# Rust Rounds: the log, for a tutor\n/)
    expect(copy).toContain("\n## Rust Rounds: the tutor's instructions\n")
    expect(copy).toContain("\n### The round: `some-ui.rust-round/1`\n")
  })

  it("holds a worked example the intake takes, as a reply would", () => {
    const example = section(copy, "## The worked example")
    expect(intakeReply(example, NO_LOG)).toMatchObject({
      ok: true,
      round: INDEXING_01,
      notes: INDEXING_01_NOTES,
    })
  })

  it("puts each card's program, choices, transcript and rustc's output in the log", () => {
    const log = section(copy, "## The log")
    expect(log).toContain("#### indexing-01, card c (variant)")
    expect(log).toContain("    let c = &s[1..2];")
    expect(log).toContain(
      '  - "Prints é" (picked): asks "Say which bytes of `s` the range `1..2` covers."'
    )
    expect(log).toContain('  - "Panics": asks "Say what is checked')
    expect(log).toContain(`- Said \`note-0003\`: "${transcript("note-0003")}"`)
    expect(log).toContain("warning: unused variable: `r`")
    expect(log).toContain("end byte index 2 is not a char boundary")
    expect(log).toContain("- Moved on before rustc's result was shown.")
    expect(log).toContain("- Pinned: indexing-01 card c.")
    expect(log).toContain("- Your guesses rustc disagreed with: none.")
    expect(log).not.toMatch(/audio/i)
  })

  it("keeps a card's evidence when its round is not on this phone", () => {
    const text = copyForTutor({
      log: WORKED_LOG,
      rounds: [],
      notes: null,
      transcripts: WORKED_TRANSCRIPTS,
      findings: [],
    })
    const log = section(text, "## The log")
    expect(log).toContain("#### indexing-01, card a\n")
    expect(log).toContain("The card itself is not on this phone.")
    expect(log).toContain('- Picked "Prints z".')
    expect(log).toContain(`- Said \`note-0001\`: "${transcript("note-0001")}"`)
    expect(log).toContain("does not compile (E0277)")
  })

  it("shows a refine card's earlier take, and a note not transcribed yet", () => {
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
    const event = {
      round: "indexing-02",
      card: "a",
      at: "2026-10-30T23:00:00Z",
      picked: null,
      note: "note-0004",
      refines: "note-0001",
      skipped: false,
      rustc: null,
    }
    const log: RoundLog = {
      ...WORKED_LOG,
      sessions: [{ ...session, cards: [event] }],
    }
    const input = {
      log,
      notes: null,
      transcripts: WORKED_TRANSCRIPTS,
      findings: [],
    }
    const earlier = `- Brought back \`note-0001\`: "${transcript("note-0001")}"`

    const text = copyForTutor({ ...input, rounds: [refining] })
    expect(text).toContain("#### indexing-02, card a (refine)")
    expect(text).toContain(earlier)
    expect(text).toContain("- Said `note-0004` (not transcribed yet)")
    expect(text).toContain("None yet: start them with your round.")
    // The log alone links both takes.
    expect(copyForTutor({ ...input, rounds: [] })).toContain(earlier)
  })

  it("lists the problems found in the last round", () => {
    const text = copyForTutor({
      log: NO_LOG,
      rounds: [],
      notes: null,
      transcripts: new Map(),
      findings: [
        { kind: "no-tutor-notes" },
        { kind: "tab", card: "a", line: 3 },
      ],
    })
    expect(section(text, "## Problems in the last round")).toContain(
      '- card "a", line 3: indent with spaces, not a tab.'
    )
    expect(copy).not.toContain("## Problems in the last round")
  })

  it("fences output longer than any backtick run in it", () => {
    const [event] = session.cards
    const log: RoundLog = {
      ...WORKED_LOG,
      sessions: [
        {
          ...session,
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
      findings: [],
    })
    expect(text).toContain("does not compile (no error code).\n\n````text\n")
  })

  it("says when nothing was played", () => {
    const text = copyForTutor({
      log: NO_LOG,
      rounds: [],
      notes: null,
      transcripts: new Map(),
      findings: [],
    })
    expect(text.trimEnd()).toMatch(/\n## The log\n\nNothing played yet\.$/)
  })
})
