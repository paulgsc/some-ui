import ROUTINE from "@rust-rounds-root/ROUTINE.md?raw"
import type { Card, Round, RoundLog } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import {
  describeFinding,
  LINE_WIDTH_CAP,
  lintRound,
  PROGRAM_LINE_CAP,
} from "@rust-rounds/lib/lint"
import { INDEXING_01, WORKED_LOG } from "@rust-rounds/lib/worked-example"
import { describe, expect, it } from "vitest"

const NO_LOG: RoundLog = { schema: LOG_SCHEMA, sessions: [] }

const [READ, VARIANT] = INDEXING_01.cards
if (READ?.kind !== "read" || VARIANT?.kind !== "variant") {
  throw new Error("the worked example changed shape")
}

const roundOf = (...cards: Array<Card>): Round => ({ ...INDEXING_01, cards })

const refine = (note: string): Card => ({
  kind: "refine",
  id: "e",
  note,
  nudge: "rustc's message names a trait. Which one?",
  aim: "understand",
  say: "Say again why `s[r]` doesn't compile, naming the trait.",
})

describe("lintRound", () => {
  it("finds nothing in the worked example", () => {
    expect(lintRound(INDEXING_01, WORKED_LOG)).toEqual([])
  })

  it("reports a line past the width cap, in a program and in a hunk", () => {
    const wide = `    let t = "${"x".repeat(LINE_WIDTH_CAP)}";`
    const program = READ.program.replace("    let r: usize = 3;", wide)
    const round = roundOf(
      { ...READ, program },
      { ...VARIANT, hunk: { line: 4, replace: wide } }
    )
    expect(lintRound(round, NO_LOG)).toEqual([
      { kind: "line-too-wide", card: "a", line: 3, width: [...wide].length },
      { kind: "line-too-wide", card: "b", line: 4, width: [...wide].length },
    ])
  })

  it("counts characters, not bytes", () => {
    const line = `// ${"é".repeat(LINE_WIDTH_CAP - 3)}`
    expect([...line]).toHaveLength(LINE_WIDTH_CAP)
    const round = roundOf({ ...READ, program: `${line}\nfn main() {}\n` })
    expect(lintRound(round, NO_LOG)).toEqual([])
  })

  it("reports a program over the line cap", () => {
    const program = `fn main() {\n${"    let _ = 1;\n".repeat(PROGRAM_LINE_CAP - 1)}}\n`
    expect(lintRound(roundOf({ ...READ, program }), NO_LOG)).toEqual([
      { kind: "program-too-long", card: "a", lines: PROGRAM_LINE_CAP + 1 },
    ])
  })

  it("reports a hunk that does not apply", () => {
    const round = roundOf(READ, { ...VARIANT, hunk: { line: 9, replace: "" } })
    expect(lintRound(round, NO_LOG)).toEqual([
      { kind: "hunk-does-not-apply", card: "b", why: "line-out-of-range" },
    ])
  })

  it("reports a choice whose `say` is blank", () => {
    const choices = READ.choices.map((choice, index) =>
      index === 1 ? { ...choice, say: "  " } : choice
    )
    expect(lintRound(roundOf({ ...READ, choices }), NO_LOG)).toEqual([
      { kind: "choice-without-say", card: "a", choice: 2 },
    ])
  })

  it("reports a refine card naming a note the log never saw", () => {
    expect(lintRound(roundOf(READ, refine("note-0001")), WORKED_LOG)).toEqual(
      []
    )
    expect(lintRound(roundOf(READ, refine("note-9999")), WORKED_LOG)).toEqual([
      { kind: "unknown-note", card: "e", note: "note-9999" },
    ])
  })

  it("counts a note said about a pasted error as seen", () => {
    const log: RoundLog = {
      ...NO_LOG,
      sessions: [
        {
          ...WORKED_LOG.sessions[0]!,
          cards: [],
          fromMyDesk: [
            {
              at: "2026-10-30T09:00:00Z",
              pasted: "error[E0382]",
              note: "note-desk",
            },
          ],
        },
      ],
    }
    expect(lintRound(roundOf(READ, refine("note-desk")), log)).toEqual([])
  })
})

describe("describeFinding", () => {
  it("names the card and what to do, for every kind", () => {
    const lines = [
      describeFinding({ kind: "line-too-wide", card: "a", line: 3, width: 52 }),
      describeFinding({ kind: "program-too-long", card: "a", lines: 30 }),
      describeFinding({
        kind: "hunk-does-not-apply",
        card: "b",
        why: "changes-nothing",
      }),
      describeFinding({ kind: "choice-without-say", card: "a", choice: 2 }),
      describeFinding({ kind: "unknown-note", card: "e", note: "note-9" }),
    ]
    for (const line of lines) expect(line).toMatch(/^card "[a-e]"/)
    expect(lines[0]).toContain(String(LINE_WIDTH_CAP))
  })

  it("agrees with ROUTINE.md on both caps", () => {
    expect(ROUTINE).toContain(`at most ${LINE_WIDTH_CAP} characters`)
    expect(ROUTINE).toContain(`at most ${PROGRAM_LINE_CAP} lines`)
  })
})
