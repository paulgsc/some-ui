/**
 * What the phone's code card shows, line by line, as plain data: each line's
 * number, whether a variant changed it, whether a diagnostic marks it, and its
 * text in runs of one tone. `CodeCard` (`components/ui/code-card`) only
 * paints this, so everything it decides is tested here without a DOM.
 */

import type { CodeToken, CodeTokenStream } from "../code-tokens"
import { tokenizeCode } from "../code-tokens"

/**
 * A stretch of the program as rustc's JSON diagnostic gives it
 * (`line_start`, `column_start`, `line_end`, `column_end`): lines and columns
 * count from 1, a column counts characters (not bytes), and the end column is
 * one past the last character marked. Checked against rustc 1.97: `s[r]` on
 * line 4 of `"aéz"`'s program gives 4:15 to 4:16, the `r`.
 */
export type CodeSpan = {
  readonly lineStart: number
  readonly columnStart: number
  readonly lineEnd: number
  readonly columnEnd: number
}

/**
 * How a run is coloured, in the `code` appearance's own terms
 * (`packages/some-styles/themes/code.css`): keywords and functions, types and
 * literals, comments, and everything else in the plain foreground.
 */
export type CodeTone = "keyword" | "type" | "literal" | "comment" | "plain"

/** Characters of one line that share a tone and whether a span marks them. */
type CodeRun = {
  /** The column its first character is in, from 1. */
  readonly column: number
  readonly text: string
  readonly tone: CodeTone
  readonly marked: boolean
}

type CodeLine = {
  /** From 1, as rustc and the gutter count. */
  readonly number: number
  /** A variant changed this line: the gutter shows `+`. */
  readonly changed: boolean
  /** A diagnostic span touches this line: the whole line is highlighted. */
  readonly marked: boolean
  readonly runs: ReadonlyArray<CodeRun>
}

/** Prism's token types and aliases, each named for the tone it is painted in. */
const TONE_OF_TYPE: ReadonlyMap<string, CodeTone> = new Map<string, CodeTone>([
  ["keyword", "keyword"],
  ["function", "keyword"],
  ["function-definition", "keyword"],
  ["macro", "keyword"],
  ["attribute", "keyword"],
  ["builtin", "keyword"],
  ["directive", "keyword"],
  ["class-name", "type"],
  ["type-definition", "type"],
  ["namespace", "type"],
  ["lifetime-annotation", "type"],
  ["constant", "type"],
  ["string", "literal"],
  ["raw-string", "literal"],
  ["char", "literal"],
  ["number", "literal"],
  ["boolean", "literal"],
  ["comment", "comment"],
  ["block-comment", "comment"],
])

function toneOf(token: CodeToken, outer: CodeTone): CodeTone {
  // `alias` is typed as always set, but Prism leaves it undefined on a token
  // with none; `concat` passes that through as one more name with no tone.
  for (const name of [token.type].concat(token.alias)) {
    const tone = TONE_OF_TYPE.get(name)
    if (tone !== undefined) return tone
  }
  return outer
}

type ToneRun = { text: string; tone: CodeTone }

/** The token tree, flattened to text in order, each piece with its tone. */
function toneRuns(
  stream: CodeTokenStream | null,
  code: string
): Array<ToneRun> {
  if (stream === null) return [{ text: code, tone: "plain" }]
  const runs: Array<ToneRun> = []
  const walk = (
    content: string | CodeToken | CodeTokenStream,
    tone: CodeTone
  ): void => {
    if (typeof content === "string") {
      runs.push({ text: content, tone })
    } else if (Array.isArray(content)) {
      for (const part of content) walk(part, tone)
    } else {
      walk(content.content, toneOf(content, tone))
    }
  }
  walk(stream, "plain")
  return runs
}

function spanMarks(
  spans: ReadonlyArray<CodeSpan>,
  line: number,
  column: number
): boolean {
  return spans.some((span) => {
    if (line < span.lineStart || line > span.lineEnd) return false
    if (line === span.lineStart && column < span.columnStart) return false
    if (line === span.lineEnd && column >= span.columnEnd) return false
    return true
  })
}

function spanTouches(spans: ReadonlyArray<CodeSpan>, line: number): boolean {
  return spans.some((span) => line >= span.lineStart && line <= span.lineEnd)
}

type CodeLinesOptions = {
  /** Lines a variant changed, numbered from 1. */
  readonly changedLines?: ReadonlyArray<number>
  /** Diagnostic spans to underline; each line they touch is highlighted. */
  readonly spans?: ReadonlyArray<CodeSpan>
}

/**
 * `code` as lines, tokenized whole first, so a construct spanning lines (a
 * block comment, a raw string) keeps its tone on each of them. A final
 * newline ends the last line rather than starting an empty one.
 */
export function codeLines(
  code: string,
  language: string,
  { changedLines = [], spans = [] }: CodeLinesOptions = {}
): ReadonlyArray<CodeLine> {
  const changed = new Set(changedLines)
  const lines: Array<{ number: number; runs: Array<CodeRun> }> = [
    { number: 1, runs: [] },
  ]
  let column = 1

  for (const { text, tone } of toneRuns(tokenizeCode(code, language), code)) {
    for (const char of Array.from(text)) {
      const line = lines[lines.length - 1]!
      if (char === "\n") {
        lines.push({ number: line.number + 1, runs: [] })
        column = 1
        continue
      }
      const marked = spanMarks(spans, line.number, column)
      const last = line.runs[line.runs.length - 1]
      if (last?.tone === tone && last.marked === marked) {
        line.runs[line.runs.length - 1] = { ...last, text: last.text + char }
      } else {
        line.runs.push({ column, text: char, tone, marked })
      }
      column += 1
    }
  }

  if (lines.length > 1 && code.endsWith("\n")) lines.pop()

  return lines.map(({ number, runs }) => ({
    number,
    changed: changed.has(number),
    marked: spanTouches(spans, number),
    runs,
  }))
}
