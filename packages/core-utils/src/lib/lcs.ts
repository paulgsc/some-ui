/**
 * The longest-common-subsequence table of `a` against `b`: `table[i][j]` is
 * the length of the longest common subsequence of `a[i..]` and `b[j..]`,
 * items compared with `===`. Walk it from `[0][0]` to read one alignment.
 */
export function lcsTable<T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>
): Array<Array<number>> {
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  )
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const row = table[i] ?? []
    const below = table[i + 1] ?? []
    for (let j = b.length - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  return table
}
