/**
 * Parses `docs/canon/complexity-witness-canon.typ` §7 (the proposition
 * register, Def. 1.5) into structured entries: the one place `CW-P` ids are
 * read as data. A hand-maintained list would be the drift Rem. 7.2 warns
 * against; `generated.ts` is built by running this parser on the real canon.
 *
 * Retirement marker: the canon does not yet say how an entry signals
 * retired status, so this parser recognizes a literal ` (retired)` suffix
 * on the title inside `name:`, e.g. `name: "CW-P5 · Preprocessing
 * substitutes space for repeated search (retired)"`. Never yet exercised
 * against a real retirement.
 *
 * `statement` is the bracketed body after `name:`, canon §7's authored
 * claim (what Thm. 6.1's proof calls "the authored statement of `μ(d)`").
 * It is read bracket-depth-aware (`bodyOfBracketBlock`), since typst content
 * may nest `[...]`.
 */

const SECTION_7_HEADING = "= The proposition register"
const NEXT_TOP_LEVEL_HEADING = /^= /m

// Requires the body's `[` right after `name:` closes, so a match ends one
// past `[`, ready for `bodyOfBracketBlock`.
const PROPOSITION_ENTRY = /#proposition\("7\.\d+",\s*name:\s*"([^"]*)"\)\[/g
// Every canon section uses `#proposition(`, so count only within `section7Of`.
const PROPOSITION_CALL_SITE = /#proposition\(/g

const NAME_SEPARATOR = " · "
const RETIRED_SUFFIX = " (retired)"

export type PropositionStatus = "active" | "retired"

export type PropositionRegisterEntry = {
  readonly id: string
  readonly title: string
  /**
   * Canon §7's authored claim: the entry's bracketed body, normalized to one
   * line with markup rendered as display text. Rendered as a round's verdict
   * justification; `title` is only the short name.
   */
  readonly statement: string
  readonly status: PropositionStatus
}

/**
 * The raw span starting at `source[openIndex]` (a backtick): its content and
 * the index past the matching close. Typst opens a raw span with *some* run
 * of backticks and closes it with a run of the same length. Shared by
 * `bodyOfBracketBlock` and `renderInlineMarkup` so the rule lives once.
 *
 * Throws on an unterminated span: `bodyOfBracketBlock` has already validated
 * every span before `renderInlineMarkup` sees one.
 */
function rawSpanAt(
  source: string,
  openIndex: number
): { content: string; afterIndex: number } {
  let runEnd = openIndex
  while (source[runEnd] === "`") runEnd += 1
  const delimiter = source.slice(openIndex, runEnd)
  const closeIndex = source.indexOf(delimiter, runEnd)
  if (closeIndex === -1) {
    throw new Error(
      `unterminated raw span ("${delimiter}" opened at index ${openIndex} with no matching close).`
    )
  }
  return {
    content: source.slice(runEnd, closeIndex),
    afterIndex: closeIndex + delimiter.length,
  }
}

/**
 * The index just past the closing, unescaped `"` of a typst string literal
 * starting at `source[openIndex]`. `\"` is skipped as a unit.
 */
function stringLiteralEndAt(source: string, openIndex: number): number {
  let index = openIndex + 1
  while (index < source.length && source[index] !== '"') {
    index += source[index] === "\\" ? 2 : 1
  }
  if (index >= source.length) {
    throw new Error(
      `unterminated string literal (a '"' opened at index ${openIndex} with no matching close).`
    )
  }
  return index + 1
}

/**
 * The index just past a typst comment starting at `source[openIndex]`. A
 * line comment runs to the next newline; a block comment to its matching
 * `*\/`, depth-aware because typst block comments nest.
 */
function commentEndAt(source: string, openIndex: number): number {
  if (source[openIndex + 1] === "/") {
    const newlineIndex = source.indexOf("\n", openIndex + 2)
    return newlineIndex === -1 ? source.length : newlineIndex
  }
  let depth = 1
  let index = openIndex + 2
  while (index < source.length && depth > 0) {
    if (source[index] === "/" && source[index + 1] === "*") {
      depth += 1
      index += 2
    } else if (source[index] === "*" && source[index + 1] === "/") {
      depth -= 1
      index += 2
    } else {
      index += 1
    }
  }
  if (depth !== 0) {
    throw new Error(
      `unterminated block comment ("/*" opened at index ${openIndex} with no matching "*/").`
    )
  }
  return index
}

/**
 * The text strictly between `source[openBracketIndex]` (`[`) and its
 * matching `]`, tracking nesting depth. Throws on an unbalanced block rather
 * than returning a truncated body.
 *
 * Four constructs are skipped without counting brackets inside them:
 *
 * - `\[` / `\]`, typst's escape for a literal bracket.
 * - a raw span (`rawSpanAt`): typst never scans its content for markup.
 * - a string literal (`stringLiteralEndAt`), e.g. `#link("a]b")`. Blunt on
 *   purpose: every unescaped `"..."` pair counts, even prose quotation marks
 *   (harmless there); exactness would need code-mode tracking this scanner
 *   does not carry.
 * - a comment (`commentEndAt`): never markup in either mode.
 *
 * Comments are also *dropped* from the returned body, unlike everything
 * else (kept verbatim): a reader never sees one, and `renderInlineMarkup`
 * would read a block comment's `*` as emphasis. Building `body`
 * incrementally lets the scan drop them without a second pass.
 */
function bodyOfBracketBlock(
  source: string,
  openBracketIndex: number
): { body: string; afterIndex: number } {
  let depth = 1
  let index = openBracketIndex + 1
  let body = ""
  while (index < source.length && depth > 0) {
    const ch = source[index]
    if (ch === "\\") {
      // Escaped character: literal, kept verbatim for `renderInlineMarkup`.
      body += source.slice(index, index + 2)
      index += 2
      continue
    }
    if (ch === "`") {
      const span = rawSpanAt(source, index)
      body += source.slice(index, span.afterIndex)
      index = span.afterIndex
      continue
    }
    if (ch === '"') {
      const endIndex = stringLiteralEndAt(source, index)
      body += source.slice(index, endIndex)
      index = endIndex
      continue
    }
    if (
      ch === "/" &&
      (source[index + 1] === "/" || source[index + 1] === "*")
    ) {
      // Dropped, not appended (see the doc comment).
      index = commentEndAt(source, index)
      continue
    }
    if (ch === "[") {
      depth += 1
      body += ch
      index += 1
      continue
    }
    if (ch === "]") {
      depth -= 1
      index += 1
      if (depth === 0) break
      body += ch
      continue
    }
    body += ch
    index += 1
  }
  if (depth !== 0) {
    throw new Error(
      `proposition register entry body starting at index ${openBracketIndex} has no matching "]" — an unbalanced "[" inside the body, or truncated canon source.`
    )
  }
  return { body, afterIndex: index }
}

// Typst math-mode symbol names the canon uses, plus common Greek letters.
// Not a typst-math parser: anything else (`^(...)`, `_...`, call parens)
// stays literal, readable as prose if not typeset.
const MATH_SYMBOL_NAMES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bTheta\b/g, "Θ"],
  [/\bOmega\b/g, "Ω"],
  [/\balpha\b/g, "α"],
  [/\bbeta\b/g, "β"],
  [/\bdelta\b/g, "δ"],
  [/\bepsilon\b/g, "ε"],
  [/\blambda\b/g, "λ"],
  [/\bsigma\b/g, "σ"],
  [/\bdot\b/g, "·"],
  [/<=/g, "≤"],
  [/>=/g, "≥"],
]

/** Applies `MATH_SYMBOL_NAMES` to a quote-free run of math-mode text. */
function substituteMathSymbols(text: string): string {
  return MATH_SYMBOL_NAMES.reduce(
    (running, [pattern, replacement]) => running.replace(pattern, replacement),
    text
  )
}

/**
 * Renders one `$...$` math span's inner content as display text.
 *
 * A quoted string in math mode (`` $T("Seq"(G_1, ..., G_m))$ ``, CW-P1/P2)
 * sets an identifier upright; the quotes are not shown, and the content is
 * copied without symbol substitution (`"Seq"` is a name, not a symbol).
 */
function renderMathSpan(innerContent: string): string {
  let result = ""
  let index = 0
  while (index < innerContent.length) {
    if (innerContent[index] === '"') {
      const endIndex = stringLiteralEndAt(innerContent, index)
      result += innerContent.slice(index + 1, endIndex - 1)
      index = endIndex
      continue
    }
    const nextQuoteIndex = innerContent.indexOf('"', index)
    const segmentEnd =
      nextQuoteIndex === -1 ? innerContent.length : nextQuoteIndex
    result += substituteMathSymbols(innerContent.slice(index, segmentEnd))
    index = segmentEnd
  }
  return result
}

/**
 * Turns an authored body's typst markup (`$Theta(n^2)$`, `*worst-case*`,
 * `` `CW-P5` ``, `---`, `\[escaped\]`) into plain display text.
 *
 * A single left-to-right scan, not one global replace per construct: a raw
 * span exists to show markup literally (`` `*literal*` ``), and only a scan
 * that jumps past each recognized construct keeps its content opaque to the
 * other rules.
 *
 * Per position: a math span (`renderMathSpan`), a raw span (content
 * unprocessed), emphasis (unwrapped), `\` escape (next character literal),
 * `---` (em dash), else the character. Nesting across *different* kinds
 * (emphasis spanning a raw span) is not attempted.
 */
function renderInlineMarkup(text: string): string {
  let result = ""
  let index = 0
  while (index < text.length) {
    const ch = text[index]
    if (ch === "\\") {
      result += text[index + 1] ?? ""
      index += 2
      continue
    }
    if (ch === "`") {
      const span = rawSpanAt(text, index)
      result += span.content
      index = span.afterIndex
      continue
    }
    if (ch === "$") {
      const closeIndex = text.indexOf("$", index + 1)
      if (closeIndex === -1) {
        result += text.slice(index)
        break
      }
      result += renderMathSpan(text.slice(index + 1, closeIndex))
      index = closeIndex + 1
      continue
    }
    if (ch === "*") {
      const closeIndex = text.indexOf("*", index + 1)
      if (closeIndex === -1) {
        result += text.slice(index)
        break
      }
      result += text.slice(index + 1, closeIndex)
      index = closeIndex + 1
      continue
    }
    if (text.startsWith("---", index)) {
      result += "—"
      index += 3
      continue
    }
    result += ch
    index += 1
  }
  return result
}

/**
 * Collapses an authored body's line breaks and indentation into one line and
 * renders its markup (`renderInlineMarkup`). The final collapse handles the
 * double space a dropped mid-line comment leaves behind.
 */
function normalizeStatement(rawBody: string): string {
  const joined = rawBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
  return renderInlineMarkup(joined).replace(/ {2,}/g, " ").trim()
}

/**
 * The text of canon §7 alone, up to the next top-level heading, so a
 * `#proposition(...)` in another section is never read as a register entry.
 */
function section7Of(canonSource: string): string {
  const startIndex = canonSource.indexOf(SECTION_7_HEADING)
  if (startIndex === -1) {
    throw new Error(
      `parsePropositionRegister could not find the "${SECTION_7_HEADING}" heading — canon §7 may have been renamed.`
    )
  }
  const afterHeading = canonSource.slice(startIndex + SECTION_7_HEADING.length)
  const nextHeading = NEXT_TOP_LEVEL_HEADING.exec(afterHeading)
  return nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading
}

/**
 * Splits one entry's `name:` string ("CW-P16 · A cost independent...")
 * into its id and title. Throws on anything not shaped "id · title".
 */
function parseEntryName(name: string): { id: string; title: string } {
  const separatorIndex = name.indexOf(NAME_SEPARATOR)
  if (separatorIndex === -1) {
    throw new Error(
      `proposition register entry "${name}" has no "${NAME_SEPARATOR}" separator between its CW-P id and its title.`
    )
  }
  const id = name.slice(0, separatorIndex)
  const title = name.slice(separatorIndex + NAME_SEPARATOR.length)
  if (!/^CW-P\d+$/.test(id)) {
    throw new Error(
      `proposition register entry "${name}" starts with "${id}", which is not a CW-P<n> id.`
    )
  }
  return { id, title }
}

/**
 * Parses every `#proposition("7.N", name: "...")` call in canon §7 into a
 * register entry, in ascending `CW-P` order. Throws if:
 *
 * - the ids are not a contiguous `CW-P1..CW-Pmax` without duplicates;
 * - §7 has a `#proposition(` call site the regex did not match (e.g. one
 *   wrapped across lines). A dropped trailing entry would otherwise still
 *   pass the contiguity check.
 */
export function parsePropositionRegister(
  canonSource: string
): ReadonlyArray<PropositionRegisterEntry> {
  const section7 = section7Of(canonSource)

  const entries: Array<PropositionRegisterEntry> = []
  for (const match of section7.matchAll(PROPOSITION_ENTRY)) {
    const rawName = match[1] ?? ""
    const { id, title } = parseEntryName(rawName)
    const retired = title.endsWith(RETIRED_SUFFIX)
    // The match ends in `[`.
    const openBracketIndex = match.index + match[0].length - 1
    const { body } = bodyOfBracketBlock(section7, openBracketIndex)
    entries.push({
      id,
      title: retired ? title.slice(0, -RETIRED_SUFFIX.length) : title,
      statement: normalizeStatement(body),
      status: retired ? "retired" : "active",
    })
  }

  if (entries.length === 0) {
    throw new Error(
      'parsePropositionRegister found no #proposition("7.N", ...) entries — canon §7 may have moved or been renamed.'
    )
  }

  const callSiteCount = [...section7.matchAll(PROPOSITION_CALL_SITE)].length
  if (callSiteCount !== entries.length) {
    throw new Error(
      `canon §7 contains ${callSiteCount} "#proposition(" call site(s) but this parser only matched ${entries.length} of them — at least one entry does not have the single-line "#proposition(\\"7.N\\", name: \\"...\\")[" shape this regex expects (a declaration wrapped across multiple lines, most likely). Fix the entry's formatting or extend PROPOSITION_ENTRY to recognize it; do not let a call site go unparsed.`
    )
  }

  entries.sort(
    (a, b) =>
      Number(a.id.slice("CW-P".length)) - Number(b.id.slice("CW-P".length))
  )

  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(
        `proposition register cites "${entry.id}" more than once.`
      )
    }
    seen.add(entry.id)
  }

  for (let n = 1; n <= entries.length; n++) {
    const expectedId = `CW-P${n}`
    if (!seen.has(expectedId)) {
      throw new Error(
        `proposition register is missing "${expectedId}" even though ${entries.length} entries were found — ids must be a contiguous CW-P1..CW-P${entries.length} sequence.`
      )
    }
  }

  return entries
}

/**
 * 1-indexed line numbers of every §7 `#proposition("7.N", name: "...")`
 * declaration. `scripts/check-proposition-citations.ts` excludes exactly
 * these lines from its citation scan, so every other `CW-P` mention in
 * `docs/canon/` is still checked.
 */
export function propositionDeclarationLineNumbers(
  canonSource: string
): ReadonlySet<number> {
  const section7 = section7Of(canonSource)
  const section7StartInFullSource = canonSource.indexOf(section7)

  const lines = new Set<number>()
  for (const match of section7.matchAll(PROPOSITION_ENTRY)) {
    const offsetInFullSource = section7StartInFullSource + match.index
    const upToMatch = canonSource.slice(0, offsetInFullSource)
    lines.add(upToMatch.split("\n").length)
  }
  return lines
}
