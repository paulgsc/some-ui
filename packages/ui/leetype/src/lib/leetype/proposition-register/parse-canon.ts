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
 */

const SECTION_7_HEADING = "= The proposition register"
const NEXT_TOP_LEVEL_HEADING = /^= /m

const PROPOSITION_ENTRY = /#proposition\("7\.\d+",\s*name:\s*"([^"]*)"\)/g
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
  readonly status: PropositionStatus
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
    entries.push({
      id,
      title: retired ? title.slice(0, -RETIRED_SUFFIX.length) : title,
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
