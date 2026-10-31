import { describe, expect, it } from "vitest"

import { CODE_CARD_WORDS, codeLines } from "."

/**
 * The worked example's program (#2231): rustc 1.97 rejects line 4 with E0277,
 * its primary span 4:15 to 4:16, the `r` in `s[r]`.
 */
const PROGRAM = [
  "fn main() {",
  '    let s = String::from("aéz");',
  "    let r: usize = 1;",
  "    let c = s[r];",
  '    println!("{c}");',
  "}",
].join("\n")

const E0277 = { lineStart: 4, columnStart: 15, lineEnd: 4, columnEnd: 16 }

const lineText = (runs: ReadonlyArray<{ text: string }>): string =>
  runs.map((run) => run.text).join("")

describe("codeLines", () => {
  it("numbers each line from 1 and keeps its text", () => {
    const lines = codeLines(PROGRAM, "rust")
    expect(lines.map((line) => line.number)).toEqual([1, 2, 3, 4, 5, 6])
    expect(lines.map((line) => lineText(line.runs))).toEqual(
      PROGRAM.split("\n")
    )
  })

  it("ends the last line at a final newline, without an empty one after it", () => {
    expect(codeLines(`${PROGRAM}\n`, "rust")).toHaveLength(6)
    expect(codeLines("", "rust")).toEqual([
      { number: 1, changed: false, marked: false, runs: [] },
    ])
  })

  it("marks exactly the characters rustc's span covers, and highlights its line", () => {
    const lines = codeLines(PROGRAM, "rust", { spans: [E0277] })
    expect(lines.map((line) => line.marked)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ])
    const marked = lines.flatMap((line) =>
      line.runs
        .filter((run) => run.marked)
        .map((run) => [line.number, run.text])
    )
    expect(marked).toEqual([[4, "r"]])
  })

  it("counts columns in characters, as rustc does", () => {
    // rustc 1.97 put E0277 on this line's `r` at columns 47 to 48. The `r` is
    // its 47th character but its 49th byte.
    const code = '    let s = "éé"; let r: usize = 1; let c = s[r];'
    const lines = codeLines(code, "rust", {
      spans: [{ lineStart: 1, columnStart: 47, lineEnd: 1, columnEnd: 48 }],
    })
    const marked = lines[0]!.runs.filter((run) => run.marked)
    expect(marked.map((run) => run.text)).toEqual(["r"])
  })

  it("marks one blank cell after the line for a span past its end", () => {
    // rustc 1.97 on a missing `;`: "expected `;`, found keyword `let`",
    // primary span 2:14 to 2:14, one past line 2's 13 characters.
    const missingSemicolon = "fn main() {\n    let x = 1\n    let y = 2;\n}\n"
    const [, line] = codeLines(missingSemicolon, "rust", {
      spans: [{ lineStart: 2, columnStart: 14, lineEnd: 2, columnEnd: 14 }],
    })
    expect(line!.marked).toBe(true)
    expect(line!.runs.at(-1)).toEqual({
      column: 14,
      text: " ",
      tone: "plain",
      marked: true,
    })
    expect(line!.runs.filter((run) => run.marked)).toHaveLength(1)

    // And on an unclosed delimiter at the end of the file: 2:16 to 2:16, on
    // a line of 14 characters.
    const unclosed = "fn main() {\n    let v = 1;\n"
    const [, last] = codeLines(unclosed, "rust", {
      spans: [{ lineStart: 2, columnStart: 16, lineEnd: 2, columnEnd: 16 }],
    })
    expect(last!.runs.at(-1)).toMatchObject({ text: " ", marked: true })
  })

  it("marks the character at a zero-width span's column inside a line", () => {
    const [line] = codeLines("let x = 1", "rust", {
      spans: [{ lineStart: 1, columnStart: 5, lineEnd: 1, columnEnd: 5 }],
    })
    const marked = line!.runs.filter((run) => run.marked)
    expect(marked.map((run) => [run.column, run.text])).toEqual([[5, "x"]])
  })

  it("reads a Windows line ending as one break", () => {
    const lines = codeLines("fn a() {}\r\nfn b() {}\r\n", "rust")
    expect(
      lines.map((line) => line.runs.map((run) => run.text).join(""))
    ).toEqual(["fn a() {}", "fn b() {}"])
  })

  it("says only plain words to assistive tech", () => {
    for (const words of Object.values(CODE_CARD_WORDS)) {
      expect(words).not.toMatch(/variant|span|diff|hunk|rustc|data-/i)
    }
  })

  it("underlines a span across lines from its start column to its end column", () => {
    const lines = codeLines("ab\ncd\nef", "rust", {
      spans: [{ lineStart: 1, columnStart: 2, lineEnd: 3, columnEnd: 2 }],
    })
    expect(
      lines.map((line) =>
        line.runs
          .filter((run) => run.marked)
          .map((run) => run.text)
          .join("")
      )
    ).toEqual(["b", "cd", "e"])
    expect(lines.every((line) => line.marked)).toBe(true)
  })

  it("flags a variant's changed lines for the gutter", () => {
    const lines = codeLines(PROGRAM, "rust", { changedLines: [4] })
    expect(
      lines.filter((line) => line.changed).map((line) => line.number)
    ).toEqual([4])
  })

  it("colours keywords, types, literals and comments in their tones", () => {
    const [line] = codeLines('let s: String = "é"; // note', "rust")
    const tones = Object.fromEntries(
      line!.runs.map((run) => [run.text.trim(), run.tone])
    )
    expect(tones).toMatchObject({
      let: "keyword",
      String: "type",
      '"é"': "literal",
      "// note": "comment",
    })
  })

  it("keeps a block comment's tone on every line it spans", () => {
    const lines = codeLines("/* one\ntwo */ fn", "rust")
    expect(lines[0]!.runs).toEqual([
      { column: 1, text: "/* one", tone: "comment", marked: false },
    ])
    expect(lines[1]!.runs[0]).toEqual({
      column: 1,
      text: "two */",
      tone: "comment",
      marked: false,
    })
  })
})
