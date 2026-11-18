/**
 * What the frame fixtures' generated inputs are written with (`./call-weeks`,
 * CF1; `./essays`, EF1): plain prose, wide letters first, and a copy of a
 * sample grown a step at a time to the most its model accepts.
 */

const WORDS = [
  "Whenever",
  "MOMENTUM",
  "wandering",
  "homework",
  "WebView",
  "Mandarin",
  "mailbox",
  "overwhelm",
  "Monday",
  "windows",
  "Malformed",
  "workflows",
  "memory",
  "Woodworking",
  "shown",
  "drawn",
  "owner",
  "week",
  "home",
  "wins",
] as const

/** `n` of `words`, from the `from`th. */
export const prose = (
  n: number,
  from = 0,
  words: ReadonlyArray<string> = WORDS
): string =>
  Array.from(
    { length: n },
    (_, i) => words[(from + i) % words.length] ?? "word"
  ).join(" ")

/**
 * `WORDS` with code spans among them, as the essay's texts carry, some
 * touching the punctuation after them ("`Vec`;"), where no line may break.
 */
export const WORDS_WITH_CODE: ReadonlyArray<string> = WORDS.flatMap((w, i) =>
  i % 7 === 3 ? ["`Vec<&'a str>`", w] : i % 7 === 5 ? ["`MmWw`'s", w] : [w]
)

/** A copy of `base` changed by `change`, read back by `parse`. */
export function edited<T>(
  base: T,
  change: (draft: T) => void,
  parse: (raw: unknown) => T
): T {
  const draft = structuredClone(base)
  change(draft)
  return parse(draft)
}

/**
 * `base` with what `set` writes at step `n` grown, a step at a time, to the
 * most `accepts` takes.
 */
export function grown<T>(
  base: T,
  set: (draft: T, n: number) => void,
  { parse, accepts }: { parse: (raw: unknown) => T; accepts: (t: T) => boolean }
): T {
  let best = base
  for (let n = 1; n < 400; n += 1) {
    const next = edited(base, (d) => set(d, n), parse)
    if (!accepts(next)) break
    best = next
  }
  return best
}
