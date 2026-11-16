/**
 * Which file in the folder home hands an essay's recorder is each answer's
 * take (RR16), for every essay that plays the owner's takes whole: the Rust
 * Rounds essay (`essay.ts`) and the interview essay (`interview-essay.ts`).
 */
import type { Parsed } from "./cut-list"

/** An owner's take as home hands it to the recorder: its audio, and its word times if home kept them. */
export type TakeFiles = {
  readonly audio: string
  readonly words: string | null
}

/** The suffix of a take's word times beside its audio: `QM-311.words.json`. */
const TAKE_WORDS = ".words.json"

/**
 * Which of `names` is each answered item's take: exactly one audio file
 * `<id>.<ext>` for each id of `answered`, and its word times
 * `<id>.words.json` where home kept them. Refuses, with every reason, a take
 * missing, two for one item, one for an item of `silent` or of neither, and
 * word times with no take, so nothing is drawn from the wrong voice. `noun`
 * names an item in those reasons ("ticket"). A take of an item of `unheard`
 * (a silence home couldn't make out, HEARD2) is set aside, not refused:
 * home may hand it over, and the essay plays none of it.
 */
export function takeFilesOf(
  items: {
    readonly answered: ReadonlyArray<string>
    readonly silent: ReadonlyArray<string>
    readonly unheard?: ReadonlyArray<string>
    readonly noun: string
  },
  names: ReadonlyArray<string>
): Parsed<Readonly<Record<string, TakeFiles>>> {
  const audio = new Map<string, Array<string>>()
  const words = new Map<string, string>()
  const problems: Array<string> = []
  const unheard = new Set(items.unheard ?? [])
  for (const name of [...names].sort()) {
    if (name.startsWith(".")) continue
    if (name.endsWith(TAKE_WORDS)) {
      const id = name.slice(0, -TAKE_WORDS.length)
      if (!unheard.has(id)) words.set(id, name)
      continue
    }
    const dot = name.lastIndexOf(".")
    const id = dot <= 0 ? name : name.slice(0, dot)
    if (unheard.has(id)) continue
    audio.set(id, [...(audio.get(id) ?? []), name])
  }
  const files: Record<string, TakeFiles> = {}
  for (const id of items.answered) {
    const found = audio.get(id) ?? []
    const [only] = found
    if (only === undefined || found.length > 1) {
      problems.push(
        only === undefined
          ? `${id}: answered, and there is no take of it`
          : `${id}: ${found.length} takes (${found.join(", ")}); one plays`
      )
      continue
    }
    files[id] = { audio: only, words: words.get(id) ?? null }
  }
  for (const [id, found] of audio)
    if (!items.answered.includes(id))
      problems.push(
        `${found.join(", ")}: ${items.silent.includes(id) ? `${id} was left silent` : `names no ${items.noun} the essay answers`}`
      )
  for (const [id, name] of words)
    if (!audio.has(id)) problems.push(`${name}: word times with no take`)
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: files }
}
