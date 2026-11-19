/**
 * What the phone makes of rustc's result (RR23, #3243), against rustc
 * 1.97.0's real output: the laid-out view keeps every diagnostic, child and
 * labelled span, in rustc's order, and a suggestion applied to the
 * program's own lines; the printout is kept whole in a terminal's colours.
 */
import type { Diagnostic, DiagnosticSpan } from "@rust-rounds/lib/formats"
import {
  applySuggestions,
  diagnosticView,
  isWhole,
  printedLines,
} from "@rust-rounds/lib/rustc-view"
import {
  E0061,
  E0061_PROGRAM,
  E0308,
  E0308_PROGRAM,
  E0382,
  E0382_PROGRAM,
  E0433,
  E0433_PROGRAM,
  E0507,
  E0507_PROGRAM,
} from "@rust-rounds/lib/rustc-view/fixture"
import { INDEXING_01_RUNS } from "@rust-rounds/lib/worked-example"
import { describe, expect, it } from "vitest"

const E0277 = INDEXING_01_RUNS["a"]
if (E0277?.outcome !== "compile-error" || E0277.diagnostics === undefined) {
  throw new Error("the worked example's card a is rustc's E0277, with its JSON")
}

const RUNS = { E0277, E0507, E0382, E0061, E0433, E0308 }

const suggestion = (
  lineStart: number,
  columnStart: number,
  lineEnd: number,
  columnEnd: number,
  replacement: string,
  file = "main.rs"
): DiagnosticSpan => ({
  file,
  lineStart,
  lineEnd,
  columnStart,
  columnEnd,
  isPrimary: true,
  label: null,
  suggestedReplacement: replacement,
})

describe("diagnosticView", () => {
  it("heads each diagnostic as rustc does, in its order, the closing lines included", () => {
    const view = diagnosticView(E0507.diagnostics ?? [], E0507_PROGRAM)
    expect(
      view.map((one) =>
        one.kind === "bare" ? one.message : `${one.head}: ${one.message}`
      )
    ).toEqual([
      "error[E0507]: cannot move out of index of `Vec<Ride>`",
      "error: aborting due to 1 previous error",
      "For more information about this error, try `rustc --explain E0507`.",
    ])
  })

  it("points at the primary span, and lists the program's labelled spans by line", () => {
    const [first] = diagnosticView(E0382.diagnostics ?? [], E0382_PROGRAM)
    if (first?.kind !== "diagnostic") throw new Error("a diagnostic first")
    expect(first.location).toBe("main.rs:8:37")
    // rustc's JSON gives them as lines 7, 8, 6; it draws them 6, 7, 8.
    expect(
      first.marks.map((mark) => [
        mark.at.kind === "line" ? mark.at.line : null,
        mark.primary,
        mark.label,
      ])
    ).toEqual([
      [
        6,
        false,
        "move occurs because `names` has type `Vec<String>`, which does not implement the `Copy` trait",
      ],
      [7, false, "value moved here"],
      [8, true, "value borrowed here after move"],
    ])
  })

  it("keeps a span in another file at its own location", () => {
    const [first] = diagnosticView(E0277.diagnostics ?? [], null)
    if (first?.kind !== "diagnostic") throw new Error("a diagnostic first")
    const implemented = first.children[1]
    expect(implemented?.location).toBeNull()
    expect(
      implemented?.marks.map((mark) =>
        mark.at.kind === "elsewhere" ? mark.at.location : null
      )
    ).toEqual([
      expect.stringMatching(/library\/core\/src\/bstr\/traits\.rs:197:1$/),
      expect.stringMatching(/library\/core\/src\/slice\/index\.rs:214:1$/),
    ])
    expect(first.children.map((child) => child.spanless)).toEqual([
      true,
      false,
      true,
    ])
  })

  it("shows a suggestion applied to the program, or as its place and text without one", () => {
    const [first] = diagnosticView(E0507.diagnostics ?? [], E0507_PROGRAM)
    if (first?.kind !== "diagnostic") throw new Error("a diagnostic first")
    const help = first.children[1]
    expect(help?.fixes).toEqual([
      {
        code: "    let last = &open[open.len() - 1];",
        firstLine: 9,
        changedLines: [9],
        inserted: [
          { lineStart: 9, columnStart: 16, lineEnd: 9, columnEnd: 17 },
        ],
      },
    ])
    expect(help?.loose).toEqual([])

    const [alone] = diagnosticView(E0507.diagnostics ?? [], null)
    if (alone?.kind !== "diagnostic") throw new Error("a diagnostic first")
    expect(alone.children[1]?.fixes).toEqual([])
    expect(alone.children[1]?.loose).toEqual([
      { location: "main.rs:9:16", replacement: "&" },
    ])
  })

  it("keeps an unlabelled span: in the program by `-->`, elsewhere by its own place", () => {
    const [first] = diagnosticView(E0061.diagnostics ?? [], E0061_PROGRAM)
    if (first?.kind !== "diagnostic") throw new Error("a diagnostic first")
    expect(first.location).toBe("main.rs:3:7")
    const [defined, provide] = first.children
    // `note: method defined here`, in the toolchain's `Vec`, unlabelled.
    expect(defined?.marks).toEqual([
      {
        at: {
          kind: "elsewhere",
          location: expect.stringMatching(/alloc\/src\/vec\/mod\.rs:1003:12$/),
        },
        primary: true,
        label: null,
      },
    ])
    // A help that is only a suggestion points nowhere but its card.
    expect(provide?.location).toBeNull()
    expect(provide?.fixes.map((fix) => fix.code)).toEqual([
      "    v.push(/* i32 */);",
    ])
  })

  it("gives each alternative its own card, never two applied at once", () => {
    const [first] = diagnosticView(E0433.diagnostics ?? [], E0433_PROGRAM)
    if (first?.kind !== "diagnostic") throw new Error("a diagnostic first")
    const fixes = first.children[0]?.fixes ?? []
    expect(
      fixes.map((fix) => [fix.code.split("\n")[0], fix.changedLines])
    ).toEqual([
      // The import and the blank line after it are new; `fn main` isn't.
      ["use std::cmp::Ordering;", [1, 2]],
      ["use std::sync::atomic::Ordering;", [1, 2]],
    ])
  })

  it("keeps a choice's parts together: `Ok(…)` or `Err(…)`, never half of one", () => {
    const [first] = diagnosticView(E0308.diagnostics ?? [], E0308_PROGRAM)
    if (first?.kind !== "diagnostic") throw new Error("a diagnostic first")
    const wrap = first.children[1]
    expect(wrap?.fixes.map((fix) => fix.code)).toEqual([
      "    Ok(5)",
      "    Err(5)",
    ])
    expect(wrap?.loose).toEqual([])
  })

  it("brackets an error's code in its heading, never a lint's name", () => {
    const lint: Diagnostic = {
      level: "warning",
      code: "unused_variables",
      message: "unused variable: `a`",
      spans: [],
      children: [],
      rendered: null,
    }
    const [warning] = diagnosticView([lint], null)
    expect(warning?.kind === "diagnostic" && warning.head).toBe("warning")
  })

  /**
   * RR23's promise to the owner: nothing rustc said is filtered. Every
   * diagnostic, every child, every labelled span and every suggestion of the
   * JSON is in the view (the screen's own test holds the same of the DOM).
   */
  it.each(Object.entries(RUNS))(
    "keeps everything rustc's JSON holds for %s",
    (_, run) => {
      const diagnostics: ReadonlyArray<Diagnostic> = run.diagnostics ?? []
      const view = diagnosticView(diagnostics, null)
      expect(view).toHaveLength(diagnostics.length)
      view.forEach((one, at) => {
        const diagnostic = diagnostics[at]!
        expect(one.message).toBe(diagnostic.message)
        if (one.kind === "bare") return
        // Every span but a suggestion is a mark, or the `-->` line alone
        // when it has nothing more to say.
        const labels = (
          spans: ReadonlyArray<DiagnosticSpan>,
          location: string | null
        ): Array<string | null> =>
          spans
            .filter((span) => span.suggestedReplacement === null)
            .filter(
              (span) =>
                span.label !== null ||
                location !==
                  `${span.file}:${span.lineStart}:${span.columnStart}`
            )
            .map((span) => span.label)
            .sort()
        expect(one.marks.map((mark) => mark.label).sort()).toEqual(
          labels(diagnostic.spans, one.location)
        )
        expect(one.children.map((child) => child.message)).toEqual(
          diagnostic.children.map((child) => child.message)
        )
        one.children.forEach((child, index) => {
          const source = diagnostic.children[index]!
          expect(child.marks.map((mark) => mark.label).sort()).toEqual(
            labels(source.spans, child.location)
          )
          expect(child.loose.map((loose) => loose.replacement)).toEqual(
            source.spans.flatMap((span) =>
              span.suggestedReplacement === null
                ? []
                : [span.suggestedReplacement]
            )
          )
        })
      })
    }
  )
})

describe("applySuggestions", () => {
  it("inserts at a zero-width span and marks the new text", () => {
    expect(
      applySuggestions(E0382_PROGRAM, [suggestion(7, 28, 7, 28, ".clone()")])
    ).toEqual({
      code: "    let count = total(names.clone());",
      firstLine: 7,
      changedLines: [7],
      inserted: [{ lineStart: 7, columnStart: 28, lineEnd: 7, columnEnd: 36 }],
    })
  })

  it("replaces, deletes and spans lines, counting columns in characters", () => {
    const program = 'fn main() {\n    let é = "x";\n    let y = 1;\n}\n'
    // Replace `"x"` (columns 13 to 16 of line 2) and delete `let ` on line 3.
    expect(
      applySuggestions(program, [
        suggestion(3, 5, 3, 9, ""),
        suggestion(2, 13, 2, 16, '"a",\n        "b"'),
      ])
    ).toEqual({
      code: '    let é = "a",\n        "b";\n    y = 1;',
      firstLine: 2,
      changedLines: [2, 3, 4],
      inserted: [{ lineStart: 2, columnStart: 13, lineEnd: 3, columnEnd: 12 }],
    })
  })

  it("applies nothing it can't place exactly", () => {
    const outside = [
      [suggestion(13, 1, 13, 1, "x")],
      [suggestion(9, 40, 9, 40, "x")],
      [suggestion(9, 16, 9, 16, "x", "src/lib.rs")],
      [suggestion(9, 16, 9, 20, "x"), suggestion(9, 18, 9, 22, "y")],
      [suggestion(9, 16, 9, 16, "x"), suggestion(9, 16, 9, 16, "y")],
      [],
    ]
    for (const spans of outside) {
      expect(applySuggestions(E0507_PROGRAM, spans)).toBeNull()
    }
  })
})

describe("printedLines", () => {
  it.each(Object.entries(RUNS))(
    "%s's diagnostics join to its printout, as home records them",
    (_, run) => {
      expect(isWhole(run.diagnostics ?? [], run.stderr)).toBe(true)
    }
  )

  it.each(Object.entries(RUNS))(
    "keeps %s's printout whole, character for character",
    (_, run) => {
      const joined = printedLines(run.stderr)
        .map((line) => line.map((piece) => piece.text).join(""))
        .join("\n")
      expect(joined).toBe(run.stderr)
    }
  )

  it("colours the levels, the gutter and the marks as a terminal does, the code left plain", () => {
    const lines = printedLines(E0507.stderr)
    const tones = (index: number): Array<[string, string]> =>
      (lines[index] ?? []).map((piece) => [piece.tone, piece.text.trim()])
    expect(tones(0)).toEqual([
      ["error", "error[E0507]:"],
      ["heading", "cannot move out of index of `Vec<Ride>`"],
    ])
    expect(tones(1)).toEqual([
      ["gutter", "-->"],
      ["dim", "main.rs:9:16"],
    ])
    expect(tones(3)).toEqual([
      ["gutter", "9 |"],
      ["plain", "let last = open[open.len() - 1];"],
    ])
    expect(tones(4).filter(([tone]) => tone !== "plain")).toEqual([
      ["gutter", "|"],
      ["primary", "^^^^^^^^^^^^^^^^^^^^"],
      [
        "primary",
        "move occurs because value has type `Ride`, which does not implement the `Copy` trait",
      ],
    ])
    const help = lines.findIndex((line) => line[0]?.text === "help:")
    expect(help).toBeGreaterThan(0)
    const plus = (lines[help + 3] ?? []).map((piece) => piece.tone)
    expect(plus).toContain("suggestion")

    // `  = help: …`: a child with no span, beside the gutter.
    const spanless = printedLines(E0277.stderr).find((line) =>
      line[0]?.text.trim().startsWith("=")
    )
    expect(spanless?.map((piece) => [piece.tone, piece.text.trim()])).toEqual([
      ["gutter", "="],
      ["help", "help:"],
      ["plain", "the trait `SliceIndex<str>` is not implemented for `usize`"],
    ])
  })
})

describe("printedLines, a multi-line span", () => {
  it("colours its `|____^` and label as rustc does: primary where the `^` is", () => {
    // rustc 1.97's E0317, an `if` without `else` in a function returning i32.
    const [closing, under] = printedLines(
      "  | |_____^ expected `i32`, found `()`\n  |       expected due to this"
    )
    expect(closing?.at(-1)?.tone).toBe("primary")
    expect(under?.at(-1)?.tone).toBe("secondary")
  })
})

describe("isWhole", () => {
  it("says whether the diagnostics are all rustc printed", () => {
    const diagnostics = E0507.diagnostics ?? []
    expect(isWhole(diagnostics, E0507.stderr)).toBe(true)
    expect(
      isWhole(diagnostics, `thread 'rustc' panicked\n${E0507.stderr}`)
    ).toBe(false)
    expect(isWhole(diagnostics.slice(0, 1), E0507.stderr)).toBe(false)
  })
})
