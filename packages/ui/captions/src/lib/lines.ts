/**
 * Line breaking under a character-count width model.
 *
 * The width of a run of words is counted in characters: every character of
 * every word, plus one space between words. A character's width in pixels is
 * one number per theme (`CaptionTheme.font.charWidthEm`, an upper bound of
 * that font's average advance, so a line the model accepts never overflows
 * in the browser). Measuring real glyphs would need a canvas and the font
 * loaded, which node has neither of; counting keeps the break the same in a
 * test, on the preview page and in the renderer.
 */

type HasText = { readonly text: string }

/** Characters a run of words takes on one line, spaces between words included. */
export const charsOf = (words: ReadonlyArray<HasText>): number =>
  words.reduce((n, w) => n + w.text.length, 0) + Math.max(0, words.length - 1)

/** Fills lines greedily; a word longer than a line gets a line of its own. */
const greedy = <W extends HasText>(
  words: ReadonlyArray<W>,
  lineChars: number
): ReadonlyArray<ReadonlyArray<W>> => {
  const rows: Array<Array<W>> = []
  let row: Array<W> = []
  for (const word of words) {
    if (row.length > 0 && charsOf([...row, word]) > lineChars) {
      rows.push(row)
      row = []
    }
    row.push(word)
  }
  if (row.length > 0) rows.push(row)
  return rows
}

/**
 * Breaks words into lines at most `lineChars` wide: one line when they fit,
 * else the two-line split whose longer line is shortest (the first such split
 * on a tie, so the top line is never the longer by choice). Words that fit no
 * two-line split come back in as many lines as greedy filling takes; cue
 * grouping (`./timing`) never hands over such a run.
 */
export function breakLines<W extends HasText>(
  words: ReadonlyArray<W>,
  lineChars: number
): ReadonlyArray<ReadonlyArray<W>> {
  if (words.length === 0) return []
  if (charsOf(words) <= lineChars) return [words]
  let best: { at: number; longest: number } | null = null
  for (let at = 1; at < words.length; at++) {
    const top = charsOf(words.slice(0, at))
    const bottom = charsOf(words.slice(at))
    const longest = Math.max(top, bottom)
    if (longest <= lineChars && (best === null || longest < best.longest))
      best = { at, longest }
  }
  return best === null
    ? greedy(words, lineChars)
    : [words.slice(0, best.at), words.slice(best.at)]
}
