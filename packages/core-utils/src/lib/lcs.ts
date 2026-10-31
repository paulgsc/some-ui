/**
 * The longest-common-subsequence table of `a` against `b`: `table[i][j]` is
 * the length of the longest common subsequence of `a[i..]` and `b[j..]`,
 * items compared with `same` (`===` unless given). Walk it from `[0][0]` to
 * read one alignment.
 */
export function lcsTable<T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>,
  same: (x: T, y: T) => boolean = (x, y) => x === y
): Array<Array<number>> {
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  )
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i] ?? []
    const below = table[i + 1] ?? []
    const x = a[i]
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const y = b[j]
      row[j] =
        x !== undefined && y !== undefined && same(x, y)
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  return table
}
