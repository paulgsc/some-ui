/**
 * Parses `docs/canon/complexity-witness-canon.typ` §7 (the proposition
 * register, Def. 1.5) into structured entries — the one place `CW-P1`
 * through `CW-P16` (and whatever the register grows to by amendment) is
 * read as data instead of transcribed by hand (LTY-PROBE B1, #1218). A
 * second, hand-maintained list of `CW-P` ids is exactly the drift Rem. 7.2
 * warns against; `generated.ts` (produced by
 * `scripts/generate-proposition-register.ts`) is the only other thing
 * allowed to know these ids, and it is built by calling this parser against
 * the real canon text, never by transcription.
 *
 * **The retirement marker is this story's own addition.** Rem. 7.1/7.2 and
 * the Amendment protocol's rule 2 establish *that* a retired proposition
 * stays numbered and citable without removal, but the canon does not yet
 * say *how* a `.typ` entry signals retired status — nothing in §7 is
 * retired as of this filing, so there was no existing convention to follow.
 * This parser recognizes a literal ` (retired)` suffix on the entry's
 * title (inside the `name:` argument, after the `CW-P`n` · ` separator),
 * e.g. `name: "CW-P5 · Preprocessing substitutes space for repeated search
 * (retired)"`. Worth a second look from whoever amends the canon to
 * actually retire an entry, since this convention has never been exercised
 * against a real one.
 *
 * **`statement` (`#1330`) is this story's own addition too.** B1 only ever
 * read the `name:` argument; it never captured the bracketed body that
 * follows — canon §7's actual authored claim (the equation or sentence
 * Thm. 6.1's proof calls "the authored statement of `μ(d)` itself"), as
 * opposed to `title`, which is only the register's short name for it. The
 * body is read bracket-depth-aware (`bodyOfBracketBlock` below) rather than
 * by a `[^\]]*` regex, because typst content between `[` and its matching
 * `]` may itself contain nested `[...]` — no entry in the canon today
 * happens to, but a parser that only works by accident of the current
 * corpus is exactly the kind of silent-miss risk this module's own history
 * (the multi-line call-site check, the retirement suffix) has already had
 * to fix once each.
 */

const SECTION_7_HEADING = "= The proposition register"
const NEXT_TOP_LEVEL_HEADING = /^= /m

// Requires the body's opening bracket immediately after the `name:`
// argument closes — true of every `#proposition(...)` call in this canon
// today (verified against the whole file, not just §7) — so a match's own
// end index always lands one past `[`, ready for `bodyOfBracketBlock`.
const PROPOSITION_ENTRY = /#proposition\("7\.\d+",\s*name:\s*"([^"]*)"\)\[/g
// A `#proposition(` call site is not unique to §7 — every numbered section
// of this canon uses the same macro (Prop. P.1, 1.1, 2.1, ... 10.1 all
// exist) — so this is only ever counted within `section7Of`'s slice, never
// against the whole file.
const PROPOSITION_CALL_SITE = /#proposition\(/g

const NAME_SEPARATOR = " · "
const RETIRED_SUFFIX = " (retired)"

export type PropositionStatus = "active" | "retired"

export type PropositionRegisterEntry = {
  readonly id: string
  readonly title: string
  /**
   * Canon §7's own authored claim — the bracketed body of the entry's
   * `#proposition(...)[...]` call, whitespace-normalized to one flowing
   * line (paragraph breaks collapsed to a single space, same posture
   * `title` already takes on being one line rather than many). This is
   * what Thm. 6.1's proof means by "the authored statement of `μ(d)`
   * itself" — B3 (`#1220`) renders it as a round's verdict justification;
   * `title` alone is only the register's short name for it, insufficient
   * on its own (`#1330`).
   */
  readonly statement: string
  readonly status: PropositionStatus
}

/**
 * The text strictly between `source[openBracketIndex]` (which must be
 * `"["`) and its matching `"]"`, tracking nesting depth rather than
 * stopping at the first `"]"` — typst content can nest brackets (a
 * `#footnote[...]`, a literal array), and this canon's own bodies are not
 * guaranteed to stay bracket-free forever just because none do today.
 * Throws on an unbalanced block rather than silently returning a truncated
 * body, the same "fail loudly, not by producing a wrong answer" posture
 * `parsePropositionRegister`'s own call-site count check already takes.
 *
 * **Two lexical escapes, not just nesting (review finding on this PR,
 * chatgpt-codex-connector).** A literal `[`/`]` inside typst content is not
 * always a content-block delimiter:
 *
 * - `\[` / `\]` — typst's own backslash escape for a literal bracket
 *   character. Counting it as structural would either close the body early
 *   (`\]`) or report a false unbalanced block (`\[`).
 * - a raw span (`` `...` ``) — typst does not scan raw-span content for
 *   markup at all, so a bracket inside one (`` `array[0]` ``) is plain text,
 *   never a delimiter. No entry in the canon does this today, but this
 *   parser has already had to fix one "only works by accident of the
 *   current corpus" gap in this same function (the nesting case above);
 *   this is the same class of risk.
 *
 * Both are skipped over — depth is never touched while scanning past
 * either — before the loop even looks at the character for bracket depth.
 */
function bodyOfBracketBlock(
  source: string,
  openBracketIndex: number
): { body: string; afterIndex: number } {
  let depth = 1
  let index = openBracketIndex + 1
  while (index < source.length && depth > 0) {
    const ch = source[index]
    if (ch === "\\") {
      // typst's escape: the following character is literal, never
      // structural, regardless of what it is.
      index += 2
      continue
    }
    if (ch === "`") {
      // A raw span: some run of backticks opens it, and the same-length
      // run closes it (typst's own rule) — skip straight to that close
      // without inspecting anything in between for bracket depth.
      let runEnd = index
      while (source[runEnd] === "`") runEnd += 1
      const delimiter = source.slice(index, runEnd)
      const closeIndex = source.indexOf(delimiter, runEnd)
      if (closeIndex === -1) {
        throw new Error(
          `proposition register entry body starting at index ${openBracketIndex} has an unterminated raw span ("${delimiter}" opened at index ${index} with no matching close).`
        )
      }
      index = closeIndex + delimiter.length
      continue
    }
    if (ch === "[") depth += 1
    else if (ch === "]") depth -= 1
    index += 1
  }
  if (depth !== 0) {
    throw new Error(
      `proposition register entry body starting at index ${openBracketIndex} has no matching "]" — an unbalanced "[" inside the body, or truncated canon source.`
    )
  }
  return {
    body: source.slice(openBracketIndex + 1, index - 1),
    afterIndex: index,
  }
}

// typst's own bare-identifier names for math-mode symbols this canon's own
// math spans are known to use, or are stable enough conventions (standard
// Greek letter names) to be worth handling defensively rather than only
// reactively — not a general typst-math parser, which real typesetting
// (superscripts, subscripts, function layout) would need and which is a
// materially bigger, riskier piece of infrastructure than a display-text
// cleanup should take on incidentally (the same call `#1330`'s own issue
// already made about not parsing the body structurally). Anything outside
// this table (`^(...)`, `_...`, function-call parens) is left as literal
// text — readable as prose, if not real typesetting.
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

/** Renders one `$...$` math span's own inner content as display text — see `MATH_SYMBOL_NAMES`'s own comment for what this deliberately does and does not attempt. */
function renderMathSpan(innerContent: string): string {
  return MATH_SYMBOL_NAMES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    innerContent
  )
}

/**
 * Turns an authored body's own typst markup into plain display text —
 * review finding on this PR (chatgpt-codex-connector): the raw statement
 * carries typst source syntax verbatim (`$Theta(n^2)$`, `*worst-case*`,
 * `` `CW-P5` ``, `---`, `\[escaped\]`), and a component rendering it as-is
 * would show that syntax to a learner rather than the sentence it authors.
 * Math substitution reads each span's *own* delimited content, so it runs
 * before backticks/emphasis are unwrapped (neither appears inside this
 * canon's own math spans today, but scoping the substitution to each
 * span's own capture group, rather than the whole string, keeps it that
 * way regardless). The backtick unwrap is run-length-aware for the same
 * reason `bodyOfBracketBlock` above is (review finding on this PR,
 * chatgpt-codex-connector): a raw span's opening and closing delimiters
 * are *some* run of backticks of matching length, not always exactly one,
 * and a regex that only strips a single pair leaves the outer backticks of
 * a `` ``two-backtick`` `` span visible. `(`+)([\s\S]+?)\1` — a
 * backreference to whatever length the opening run actually was — is what
 * makes that symmetric with the extraction side instead of drifting from
 * it again. The backslash-unescape runs last and is deliberately narrow:
 * it turns `\[`/`\]` (the case `bodyOfBracketBlock` above already has to
 * recognize for bracket depth) back into a literal bracket. It is not a
 * general typst-escape resolver — an escaped `` \` ``/`\*`/`\$` would
 * still be read by the steps above as a real delimiter, since none of
 * canon §7's bodies do that today and handling it soundly needs resolving
 * escapes before, not after, those steps run (a masking pass, not a plain
 * sequential replace) — real complexity this display-text cleanup
 * shouldn't take on speculatively.
 */
function renderInlineMarkup(text: string): string {
  return text
    .replace(/\$([^$]*)\$/g, (_match, inner: string) => renderMathSpan(inner))
    .replace(/(`+)([\s\S]+?)\1/g, "$2")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/---/g, "—")
    .replace(/\\([[\]])/g, "$1")
}

/**
 * Collapses an authored body's own line breaks and indentation into one
 * flowing line — the same "one line, not many" shape `title` already has,
 * so `statement` reads as a single sentence-or-two rather than carrying
 * the `.typ` source's own indentation into rendered UI — and renders its
 * inline typst markup as display text (`renderInlineMarkup`).
 */
function normalizeStatement(rawBody: string): string {
  const joined = rawBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
  return renderInlineMarkup(joined)
}

/**
 * The text of canon §7 alone — from its own heading up to (not including)
 * the next top-level heading. Scoping both the entry regex and its own
 * sanity count (below) to this slice, rather than the whole file, is what
 * keeps them from ever confusing a `#proposition(...)` call in another
 * section (Prop. 9.1, Prop. 4.1, ...) for a register entry.
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
 * into its id and title. Throws on anything that doesn't have the
 * register's own "id · title" shape — a malformed entry should fail
 * generation loudly, not silently produce a wrong union.
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
 * register entry, in ascending `CW-P` numeric order. Throws if:
 *
 * - the ids found are not exactly a contiguous `CW-P1..CW-Pmax` with no
 *   duplicate — a gap or a duplicate means either the canon or this parser
 *   disagrees with itself;
 * - §7 contains a `#proposition(` call site this parser's regex did not
 *   match — most likely one wrapped across multiple lines, which the
 *   regex's single-line shape does not recognize (review finding on
 *   #1241, chatgpt-codex-connector). Left unparsed, a trailing entry like
 *   this would silently vanish from the generated union rather than fail
 *   loudly, since a shorter-but-still-contiguous sequence passes the
 *   contiguity check above on its own.
 *
 * Either way a generated file built from a silent miss would be
 * untrustworthy, so both are fatal rather than best-effort.
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
    // `match.index` is where `#proposition(` starts and this match's own
    // text ends in `"["`, so the open bracket is the match's last
    // character.
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
 * 1-indexed line numbers, in `canonSource`, of every §7 register
 * declaration's `#proposition("7.N", name: "...")` call — the register's
 * own definition sites. `scripts/check-proposition-citations.ts` excludes
 * exactly these lines (not the whole canon tree) from its citation scan,
 * so a `CW-P` mention anywhere else in `docs/canon/` — including
 * elsewhere in this same file — is still checked like any other citation
 * (review finding on #1241, chatgpt-codex-connector).
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
