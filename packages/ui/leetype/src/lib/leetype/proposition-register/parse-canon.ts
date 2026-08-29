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

const PROPOSITION_ENTRY = /#proposition\("7\.\d+",\s*name:\s*"([^"]*)"\)/g

const NAME_SEPARATOR = " · "
const RETIRED_SUFFIX = " (retired)"

export type PropositionStatus = "active" | "retired"

export type PropositionRegisterEntry = {
  readonly id: string
  readonly title: string
  readonly status: PropositionStatus
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
 * register entry, in ascending `CW-P` numeric order. Throws if the ids
 * found are not exactly a contiguous `CW-P1..CW-Pmax` with no duplicate —
 * a gap or a duplicate means either the canon or this parser disagrees
 * with itself, and either way a generated file built from it would be
 * silently untrustworthy.
 */
export function parsePropositionRegister(
  canonSource: string
): ReadonlyArray<PropositionRegisterEntry> {
  const entries: Array<PropositionRegisterEntry> = []
  for (const match of canonSource.matchAll(PROPOSITION_ENTRY)) {
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
