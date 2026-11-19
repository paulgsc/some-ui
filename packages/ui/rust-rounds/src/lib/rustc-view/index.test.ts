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
  printedLines,
} from "@rust-rounds/lib/rustc-view"
import {
  E0382,
  E0382_PROGRAM,
  E0507,
  E0507_PROGRAM,
} from "@rust-rounds/lib/rustc-view/fixture"
import { INDEXING_01_RUNS } from "@rust-rounds/lib/worked-example"
import { describe, expect, it } from "vitest"

const E0277 = INDEXING_01_RUNS["a"]
if (E0277?.outcome !== "compile-error" || E0277.diagnostics === undefined) {
  throw new Error("the worked example's card a is rustc's E0277, with its JSON")
}

const RUNS = { E0277, E0507, E0382 }

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
    expect(help?.fix).toEqual({
      code: "    let last = &open[open.len() - 1];",
      firstLine: 9,
      changedLines: [9],
      inserted: [{ lineStart: 9, columnStart: 16, lineEnd: 9, columnEnd: 17 }],
    })
    expect(help?.loose).toEqual([])

    const [alone] = diagnosticView(E0507.diagnostics ?? [], null)
    if (alone?.kind !== "diagnostic") throw new Error("a diagnostic first")
    expect(alone.children[1]?.fix).toBeNull()
    expect(alone.children[1]?.loose).toEqual([
      { location: "main.rs:9:16", replacement: "&" },
    ])
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
        const labels = (spans: ReadonlyArray<DiagnosticSpan>): Array<string> =>
          spans
            .filter((span) => span.suggestedReplacement === null)
            .flatMap((span) => (span.label === null ? [] : [span.label]))
            .sort()
        expect(one.marks.map((mark) => mark.label).sort()).toEqual(
          labels(diagnostic.spans)
        )
        expect(one.children.map((child) => child.message)).toEqual(
          diagnostic.children.map((child) => child.message)
        )
        one.children.forEach((child, index) => {
          const source = diagnostic.children[index]!
          expect(child.marks.map((mark) => mark.label).sort()).toEqual(
            labels(source.spans)
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
      expect(
        (run.diagnostics ?? []).map((one) => one.rendered ?? "").join("")
      ).toBe(run.stderr)
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
