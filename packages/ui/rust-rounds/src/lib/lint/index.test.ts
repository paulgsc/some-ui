import ROUTINE from "@rust-rounds-root/ROUTINE.md?raw"
import type { Card, Round, RoundLog } from "@rust-rounds/lib/formats"
import { LOG_SCHEMA } from "@rust-rounds/lib/formats"
import type { Finding } from "@rust-rounds/lib/lint"
import {
  columns,
  describeFinding,
  LINE_WIDTH_CAP,
  lintRound,
  PROGRAM_LINE_CAP,
} from "@rust-rounds/lib/lint"
import { INDEXING_01 } from "@rust-rounds/lib/worked-example"
import { WORKED_LOG } from "@rust-rounds/lib/worked-example/fixture"
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

describe("columns", () => {
  it("counts grapheme clusters, two for a wide one", () => {
    expect(columns('let s = "aéz";')).toBe(14)
    expect(columns("é")).toBe(1)
    expect(columns("한글")).toBe(4)
    expect(columns("ｚ")).toBe(2)
    expect(columns("🦀")).toBe(2)
    expect(columns("\tx")).toBe(5)
  })
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
    const width = wide.length
    expect(lintRound(round, NO_LOG)).toEqual([
      { kind: "line-too-wide", card: "a", line: 3, width },
      { kind: "line-too-wide", card: "b", line: 4, width },
    ])
  })

  it("reports a line of wide characters that fits in characters but not in columns", () => {
    const line = `// ${"한".repeat(20)}`
    const round = roundOf({ ...READ, program: `${line}\nfn main() {}\n` })
    expect(lintRound(round, NO_LOG)).toEqual([
      { kind: "line-too-wide", card: "a", line: 1, width: 43 },
    ])
  })

  it("reports a tab", () => {
    const program = READ.program.replace("    let r", "\tlet r")
    expect(lintRound(roundOf({ ...READ, program }), NO_LOG)).toEqual([
      { kind: "tab", card: "a", line: 3 },
    ])
  })

  it("reports a program over the line cap", () => {
    const program = `fn main() {\n${"    let _ = 1;\n".repeat(PROGRAM_LINE_CAP - 1)}}\n`
    expect(lintRound(roundOf({ ...READ, program }), NO_LOG)).toEqual([
      { kind: "program-too-long", card: "a", lines: PROGRAM_LINE_CAP + 1 },
    ])
  })

  it("reports a hunk that changes nothing", () => {
    const same = { ...VARIANT, hunk: { line: 4, replace: "    let c = s[r];" } }
    expect(lintRound(roundOf(READ, same), NO_LOG)).toEqual([
      { kind: "hunk-changes-nothing", card: "b" },
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
  it("says what to do for every kind, naming the card where there is one", () => {
    const findings: Array<Finding> = [
      { kind: "line-too-wide", card: "a", line: 3, width: 52 },
      { kind: "tab", card: "a", line: 3 },
      { kind: "program-too-long", card: "a", lines: 30 },
      { kind: "hunk-changes-nothing", card: "b" },
      { kind: "choice-without-say", card: "a", choice: 2 },
      { kind: "unknown-note", card: "e", note: "note-9" },
    ]
    for (const finding of findings) {
      expect(describeFinding(finding)).toMatch(/^card "[a-e]"/)
    }
    expect(describeFinding({ kind: "no-tutor-notes" })).toMatch(/tutor notes/)
  })

  it("agrees with ROUTINE.md on both caps", () => {
    expect(ROUTINE).toContain(`at most ${LINE_WIDTH_CAP} columns`)
    expect(ROUTINE).toContain(`at most ${PROGRAM_LINE_CAP} lines`)
  })
})
