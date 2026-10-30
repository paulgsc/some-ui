/**
 * Line breaking under a width model: a `Measure` says how wide a run of
 * words is and how wide a line may be, in one unit. Captions measure in
 * pixels from the font's advance widths (`./text`), so the break is the same
 * in a test, on the preview page and in the renderer, with no canvas.
 */

export type HasText = { readonly text: string }

export type Measure<W extends HasText = HasText> = {
  /** A run of words on one line, spaces between words included. */
  readonly widthOf: (row: ReadonlyArray<W>) => number
  /** The widest a line may be. */
  readonly limit: number
}

/**
 * Fills lines greedily while `fits` accepts the line; a word too long for a
 * line gets a line of its own.
 */
export const greedy = <W extends HasText>(
  words: ReadonlyArray<W>,
  fits: (line: ReadonlyArray<W>) => boolean
): ReadonlyArray<ReadonlyArray<W>> => {
  const rows: Array<Array<W>> = []
  let row: Array<W> = []
  for (const word of words) {
    if (row.length > 0 && !fits([...row, word])) {
      rows.push(row)
      row = []
    }
    row.push(word)
  }
  if (row.length > 0) rows.push(row)
  return rows
}

/**
 * Breaks words into lines at most `measure.limit` wide: one line when they fit,
 * else the two-line split whose longer line is shortest (the first such split
 * on a tie, so the top line is never the longer by choice). Words that fit no
 * two-line split come back in as many lines as greedy filling takes; cue
 * grouping (`./timing`) never hands over such a run.
 */
export function breakLines<W extends HasText>(
  words: ReadonlyArray<W>,
  { widthOf, limit }: Measure<W>
): ReadonlyArray<ReadonlyArray<W>> {
  if (words.length === 0) return []
  if (widthOf(words) <= limit) return [words]
  let best: { at: number; longest: number } | null = null
  for (let at = 1; at < words.length; at++) {
    const top = widthOf(words.slice(0, at))
    const bottom = widthOf(words.slice(at))
    const longest = Math.max(top, bottom)
    if (longest <= limit && (best === null || longest < best.longest))
      best = { at, longest }
  }
  return best === null
    ? greedy(words, (line) => widthOf(line) <= limit)
    : [words.slice(0, best.at), words.slice(best.at)]
}
