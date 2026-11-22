/**
 * rustc's result as the phone lays it out (RR23, #3243), as plain data:
 * `components/rustc-run` only paints this, so what it shows is decided and
 * tested here without a DOM.
 *
 * Two readings of one compile error, both in rustc's words (the owner's call
 * C650): `diagnosticView`, every diagnostic of rustc's JSON in its order,
 * laid out to wrap, nothing left out; and `printedLines`, rustc's printout
 * unchanged, in runs a terminal would colour (its source lines stay plain:
 * the program's code card is the one highlighter).
 */
import type {
  Diagnostic,
  DiagnosticChild,
  DiagnosticSpan,
} from "@rust-rounds/lib/formats"
import type { CodeSpan } from "@some-ui/shared"

/** The program's own file, as rustc names it. */
const PROGRAM_FILE = "main.rs"

/** Where a mark sits: a line of the program, or a place in another file. */
type MarkAt =
  | { readonly kind: "line"; readonly line: number }
  | { readonly kind: "elsewhere"; readonly location: string }

/** A span: its place, whether it is primary (`^`) or not (`-`), its label if any. */
export type Mark = {
  readonly at: MarkAt
  readonly primary: boolean
  readonly label: string | null
}

/** A suggestion applied to the program's lines, for a code card. */
export type Fix = {
  readonly code: string
  readonly firstLine: number
  readonly changedLines: ReadonlyArray<number>
  readonly inserted: ReadonlyArray<CodeSpan>
}

/** A suggestion that can't be applied to the program: its place and text. */
type LooseSuggestion = {
  readonly location: string
  readonly replacement: string
}

export type ChildView = {
  readonly level: string
  readonly message: string
  /** rustc prints a child with no span as `= note: …`. */
  readonly spanless: boolean
  readonly location: string | null
  readonly marks: ReadonlyArray<Mark>
  /** One card per choice rustc gave, a multipart one's parts applied together. */
  readonly fixes: ReadonlyArray<Fix>
  readonly loose: ReadonlyArray<LooseSuggestion>
}

export type DiagnosticView =
  | {
      readonly kind: "diagnostic"
      /** As rustc heads it: `error[E0507]`, `error`, `warning` (a lint's name stays out). */
      readonly head: string
      readonly level: string
      readonly message: string
      readonly location: string | null
      readonly marks: ReadonlyArray<Mark>
      readonly children: ReadonlyArray<ChildView>
    }
  /** `For more information about this error, …`: rustc prints it bare. */
  | { readonly kind: "bare"; readonly message: string }

const locationOf = (span: DiagnosticSpan): string =>
  `${span.file}:${span.lineStart}:${span.columnStart}`

const isSuggestion = (span: DiagnosticSpan): boolean =>
  span.suggestedReplacement !== null

/**
 * The span `-->` points at: the first primary one in the program that isn't a
 * suggestion. One in another file is told by its own mark, as rustc does.
 */
const locatedSpan = (
  spans: ReadonlyArray<DiagnosticSpan>
): DiagnosticSpan | undefined =>
  spans.find(
    (span) =>
      span.isPrimary && span.file === PROGRAM_FILE && !isSuggestion(span)
  )

/**
 * Every span that isn't a suggestion, but the located one when `-->` alone
 * says all it holds (it has no label): the program's by line and column, as
 * rustc draws them, then the rest in the JSON's order.
 */
function marksOf(
  spans: ReadonlyArray<DiagnosticSpan>,
  located: DiagnosticSpan | undefined
): ReadonlyArray<Mark> {
  const shown = spans.filter(
    (span) => !isSuggestion(span) && !(span === located && span.label === null)
  )
  const inProgram = shown
    .filter((span) => span.file === PROGRAM_FILE)
    .sort((a, b) => a.lineStart - b.lineStart || a.columnStart - b.columnStart)
  const elsewhere = shown.filter((span) => span.file !== PROGRAM_FILE)
  return [
    ...inProgram.map(
      (span): Mark => ({
        at: { kind: "line", line: span.lineStart },
        primary: span.isPrimary,
        label: span.label,
      })
    ),
    ...elsewhere.map(
      (span): Mark => ({
        at: { kind: "elsewhere", location: locationOf(span) },
        primary: span.isPrimary,
        label: span.label,
      })
    ),
  ]
}

/** `text` as an array of characters (code points), as rustc counts columns. */
const chars = (text: string): Array<string> => Array.from(text)

/**
 * A child's suggestions applied to the program's lines they touch, with
 * where the new text sits. `null` when any of them is outside the program,
 * past its lines or columns, or overlaps another.
 */
export function applySuggestions(
  program: string,
  suggestions: ReadonlyArray<DiagnosticSpan>
): Fix | null {
  if (suggestions.length === 0) return null
  const lines = program.replaceAll("\r\n", "\n").split("\n")
  const first = Math.min(...suggestions.map((span) => span.lineStart))
  const last = Math.max(...suggestions.map((span) => span.lineEnd))
  if (first < 1 || last > lines.length) return null
  const excerpt = lines.slice(first - 1, last).map(chars)
  // A place in the excerpt as one offset into its characters, `\n` included.
  const offsetOf = (line: number, column: number): number | null => {
    const row = excerpt[line - first]
    if (row === undefined || column < 1 || column > row.length + 1) return null
    let offset = column - 1
    for (let index = 0; index < line - first; index += 1) {
      offset += excerpt[index]!.length + 1
    }
    return offset
  }
  const edits: Array<{ from: number; to: number; text: Array<string> }> = []
  for (const span of suggestions) {
    if (span.file !== PROGRAM_FILE) return null
    const from = offsetOf(span.lineStart, span.columnStart)
    const to = offsetOf(span.lineEnd, span.columnEnd)
    if (from === null || to === null || to < from) return null
    edits.push({ from, to, text: chars(span.suggestedReplacement ?? "") })
  }
  edits.sort((a, b) => a.from - b.from)
  for (let index = 1; index < edits.length; index += 1) {
    const [previous, edit] = [edits[index - 1]!, edits[index]!]
    if (edit.from < previous.to || edit.from === previous.from) return null
  }

  const source = excerpt.map((row) => row.join("")).join("\n")
  const before = chars(source)
  const out: Array<string> = []
  const newRanges: Array<{ from: number; to: number }> = []
  let at = 0
  for (const edit of edits) {
    out.push(...before.slice(at, edit.from))
    newRanges.push({ from: out.length, to: out.length + edit.text.length })
    out.push(...edit.text)
    at = edit.to
  }
  out.push(...before.slice(at))

  // Each offset in the result as its line and column, numbered from `first`.
  const placeOf = (offset: number): { line: number; column: number } => {
    let line = first
    let column = 1
    for (let index = 0; index < offset; index += 1) {
      if (out[index] === "\n") {
        line += 1
        column = 1
      } else {
        column += 1
      }
    }
    return { line, column }
  }
  const inserted: Array<CodeSpan> = []
  const changed = new Set<number>()
  for (const range of newRanges) {
    const start = placeOf(range.from)
    const end = placeOf(range.to)
    // The line of the last new character: a new `\n` ends its own line.
    const lastLine = placeOf(Math.max(range.from, range.to - 1)).line
    for (let line = start.line; line <= lastLine; line += 1) changed.add(line)
    if (range.to > range.from) {
      inserted.push({
        lineStart: start.line,
        columnStart: start.column,
        lineEnd: end.line,
        columnEnd: end.column,
      })
    }
  }
  return {
    code: out.join(""),
    firstLine: first,
    changedLines: [...changed].sort((a, b) => a - b),
    inserted,
  }
}

/** Whether two suggestions collide: they start at one place, or overlap. */
function collide(a: DiagnosticSpan, b: DiagnosticSpan): boolean {
  const [first, second] =
    a.lineStart < b.lineStart ||
    (a.lineStart === b.lineStart && a.columnStart <= b.columnStart)
      ? [a, b]
      : [b, a]
  const sameStart =
    first.lineStart === second.lineStart &&
    first.columnStart === second.columnStart
  const startsInside =
    second.lineStart < first.lineEnd ||
    (second.lineStart === first.lineEnd && second.columnStart < first.columnEnd)
  return sameStart || startsInside
}

/**
 * A child's suggestions as rustc's choices, in its order: a choice's parts
 * come together in the JSON (`Ok(` then `)`), and the next choice starts
 * where a part would collide with one already in the current choice
 * (`Err(` at `Ok(`'s place, or a second import at the first's). rustc's
 * JSON doesn't mark the boundary, so parts that never collide are taken as
 * one multipart suggestion.
 */
function choicesOf(
  suggestions: ReadonlyArray<DiagnosticSpan>
): ReadonlyArray<ReadonlyArray<DiagnosticSpan>> {
  const choices: Array<Array<DiagnosticSpan>> = []
  for (const span of suggestions) {
    const current = choices.at(-1)
    if (current?.every((part) => !collide(part, span))) current.push(span)
    else choices.push([span])
  }
  return choices
}

function childView(child: DiagnosticChild, program: string | null): ChildView {
  const suggestions = child.spans.filter(isSuggestion)
  const fixes: Array<Fix> = []
  const loose: Array<LooseSuggestion> = []
  for (const group of choicesOf(suggestions)) {
    const fix = program === null ? null : applySuggestions(program, group)
    if (fix === null) {
      loose.push(
        ...group.map((span) => ({
          location: locationOf(span),
          replacement: span.suggestedReplacement ?? "",
        }))
      )
    } else {
      fixes.push(fix)
    }
  }
  const located = locatedSpan(child.spans)
  return {
    level: child.level,
    message: child.message,
    spanless: child.spans.length === 0,
    location: located === undefined ? null : locationOf(located),
    marks: marksOf(child.spans, located),
    fixes,
    loose,
  }
}

/** rustc brackets an error's `E` code in its heading, never a lint's name. */
const ERROR_CODE = /^E\d{4}$/

/**
 * Whether the diagnostics are all rustc printed: each one's `rendered` joins
 * to the printout. Not when rustc printed something else too (a compiler
 * panic's backtrace) or home kept only part of it.
 */
export const isWhole = (
  diagnostics: ReadonlyArray<Diagnostic>,
  printed: string
): boolean =>
  diagnostics.map((diagnostic) => diagnostic.rendered ?? "").join("") ===
  printed

/**
 * Every diagnostic of a compile, in rustc's order, as the phone lays it out.
 * `program` is the source rustc compiled as `main.rs`, which a suggestion is
 * applied to; with none, a suggestion is shown as its place and text.
 */
export function diagnosticView(
  diagnostics: ReadonlyArray<Diagnostic>,
  program: string | null
): ReadonlyArray<DiagnosticView> {
  return diagnostics.map((diagnostic): DiagnosticView => {
    if (diagnostic.level === "failure-note") {
      return { kind: "bare", message: diagnostic.message }
    }
    const located = locatedSpan(diagnostic.spans)
    return {
      kind: "diagnostic",
      head:
        diagnostic.code !== null && ERROR_CODE.test(diagnostic.code)
          ? `${diagnostic.level}[${diagnostic.code}]`
          : diagnostic.level,
      level: diagnostic.level,
      message: diagnostic.message,
      location: located === undefined ? null : locationOf(located),
      marks: marksOf(diagnostic.spans, located),
      children: diagnostic.children.map((child) => childView(child, program)),
    }
  })
}

// ── The printout, coloured ─────────────────────────────────────────────────

/** How a stretch of rustc's printout is coloured, in a terminal's terms. */
export type PrintedTone =
  | "error"
  | "warning"
  | "note"
  | "help"
  /** A diagnostic's heading after its level: bold. */
  | "heading"
  /** The `|`, line numbers, `-->` and `=` down the left. */
  | "gutter"
  /** `^` under a primary span, and its label. */
  | "primary"
  /** `-` under a secondary span, `|` joining a label to it, and its label. */
  | "secondary"
  /** `+` and `~` under a suggestion. */
  | "suggestion"
  /** A location, and `For more information …`. */
  | "dim"
  | "plain"

export type PrintedRun = { readonly text: string; readonly tone: PrintedTone }

const LEVEL_TONE: Readonly<Record<string, PrintedTone>> = {
  error: "error",
  warning: "warning",
  note: "note",
  help: "help",
}

const MARKER_TONE: Readonly<Record<string, PrintedTone>> = {
  "^": "primary",
  "-": "secondary",
  "|": "secondary",
  "+": "suggestion",
  "~": "suggestion",
}

/** The tone of a level's word: `error`, `note`, … */
export const toneOfLevel = (level: string): PrintedTone =>
  LEVEL_TONE[level] ?? "plain"

/** A character a marker row draws with. */
const isMarker = (c: string): boolean => "^-+~|".includes(c)

/**
 * A marker row split into its markers and its label: the longest run of
 * markers and whitespace from the start that ends on a marker, followed by
 * nothing or by whitespace and the label. Null when the row is no marker
 * row. One pass, so a long row costs its length (a regular expression for
 * it backtracks quadratically).
 */
export function splitMarkers(
  rest: string
): { readonly markers: string; readonly label: string | undefined } | null {
  let end = -1
  for (let i = 0; i < rest.length; i++) {
    const c = rest.charAt(i)
    if (isMarker(c)) {
      const next = rest.charAt(i + 1)
      if (next === "" || /\s/.test(next)) end = i
    } else if (!/\s/.test(c)) break
  }
  if (end === -1) return null
  const label = rest.slice(end + 1)
  return {
    markers: rest.slice(0, end + 1),
    label: label === "" ? undefined : label,
  }
}

/** The marker row under a source line: `^^^^ label`, `----- label`, `+`. */
function markerRuns(rest: string): Array<PrintedRun> | null {
  const split = splitMarkers(rest)
  if (split === null) return null
  const { markers, label } = split
  const runs: Array<PrintedRun> = []
  let last: PrintedTone = "plain"
  for (const piece of markers.match(/\s+|[\^]+|-+|\++|~+|\|/g) ?? []) {
    const tone = MARKER_TONE[piece[0] ?? ""] ?? "plain"
    if (tone !== "plain") last = tone
    runs.push({ text: piece, tone })
  }
  if (label !== undefined) runs.push({ text: label, tone: last })
  return runs
}

function printedLine(line: string): ReadonlyArray<PrintedRun> {
  const level = /^(error|warning|note|help)(\[[^\]]*\])?:/.exec(line)
  if (level !== null) {
    const [prefix, word = ""] = level
    const rest = line.slice(prefix.length)
    const isHeading = word === "error" || word === "warning"
    return [
      { text: prefix, tone: toneOfLevel(word) },
      ...(rest === ""
        ? []
        : [{ text: rest, tone: isHeading ? "heading" : "plain" } as const]),
    ]
  }
  if (line.startsWith("For more information")) {
    return [{ text: line, tone: "dim" }]
  }
  // A child with no span: `  = note: …`, beside the gutter, not in it.
  const spanless = /^(\s*=\s*)(note|help|warning|error)(:)(.*)$/.exec(line)
  if (spanless !== null) {
    const [, eq = "", word = "", colon = "", text = ""] = spanless
    return [
      { text: eq, tone: "gutter" },
      { text: word + colon, tone: toneOfLevel(word) },
      { text, tone: "plain" },
    ]
  }
  // `  --> main.rs:9:16`, matched as text: rustc's arrow, not markup.
  const indent = line.length - line.trimStart().length
  if (line.startsWith(RUSTC_GLYPHS.arrow, indent)) {
    const end = indent + RUSTC_GLYPHS.arrow.length
    return [
      { text: line.slice(0, end), tone: "gutter" },
      { text: line.slice(end), tone: "dim" },
    ]
  }
  if (/^\s*\.\.\.\s*$/.test(line)) return [{ text: line, tone: "gutter" }]
  // One way to read each space, so a long run of them stays linear.
  const gutter = /^(\s*(?:(\d+)\s*)?\|)(.*)$/.exec(line)
  if (gutter !== null) {
    const [, bar = "", number = "", rest = ""] = gutter
    const head: PrintedRun = { text: bar, tone: "gutter" }
    // A numbered row is the program's own line, kept plain. An unnumbered
    // one is rustc's: markers and their labels, or a multi-line span's
    // `|____^` and its label, or a label alone under the `|` joining it to
    // its span. Such a row is one colour: primary if it holds a `^`, else
    // secondary, which leaves a primary label pushed under its `|` coloured
    // secondary (rustc colours it primary; the text is unchanged).
    if (number !== "") return [head, { text: rest, tone: "plain" }]
    const markers = markerRuns(rest)
    if (markers !== null) return [head, ...markers]
    const indent = rest.length - rest.trimStart().length
    return [
      head,
      { text: rest.slice(0, indent), tone: "plain" },
      {
        text: rest.slice(indent),
        tone: rest.includes("^") ? "primary" : "secondary",
      },
    ]
  }
  return [{ text: line, tone: "plain" }]
}

/**
 * rustc's printout, line by line, in runs of one tone. The text is kept
 * whole: joining every run of every line with `\n` gives `text` back.
 */
export function printedLines(
  text: string
): ReadonlyArray<ReadonlyArray<PrintedRun>> {
  return text
    .split("\n")
    .map((line) => printedLine(line).filter((run) => run.text !== ""))
}

// ── rustc's own notation ───────────────────────────────────────────────────

/**
 * The marks rustc draws in its printout, which the laid-out view keeps so it
 * reads as rustc does. They are rustc's notation, not the app's words.
 */
export const RUSTC_GLYPHS = {
  arrow: "-->",
  bar: "|",
  primary: "^",
  secondary: "-",
  spanless: "=",
  inserted: "+",
} as const

/** A message in stretches, each `ticked` one a backticked name kept with its ticks. */
type TickedRun = { readonly text: string; readonly ticked: boolean }

/**
 * rustc's message as it printed it, split at its backticked names
 * (`Vec<Ride>`) so they can be coloured; joining the runs gives `text` back.
 * Not video-render's `codeSpans`: that lives with the essay's frame model,
 * which the phone's build leaves out (`check:bundle-paths`, mobile).
 */
export function tickedRuns(text: string): ReadonlyArray<TickedRun> {
  return text
    .split(/(`[^`]+`)/)
    .filter((piece) => piece !== "")
    .map((piece) => ({
      text: piece,
      ticked: piece.length > 2 && piece.startsWith("`") && piece.endsWith("`"),
    }))
}
