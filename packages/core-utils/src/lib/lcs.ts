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

/** One step of an alignment: an item of both, or of `a` or `b` alone. */
export type LcsStep<T> =
  | { readonly kind: "both"; readonly a: T; readonly b: T }
  | { readonly kind: "a"; readonly a: T }
  | { readonly kind: "b"; readonly b: T }

/**
 * One longest alignment of `a` with `b` under `same`, in order: where the
 * two part, `a`'s items come before `b`'s.
 */
export function lcsAlignment<T>(
  a: ReadonlyArray<T>,
  b: ReadonlyArray<T>,
  same: (x: T, y: T) => boolean = (x, y) => x === y
): Array<LcsStep<T>> {
  const table = lcsTable(a, b, same)
  const steps: Array<LcsStep<T>> = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const x = a[i]
    const y = b[j]
    if (x !== undefined && y !== undefined && same(x, y)) {
      steps.push({ kind: "both", a: x, b: y })
      i += 1
      j += 1
    } else if (
      x !== undefined &&
      (y === undefined || (table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0))
    ) {
      steps.push({ kind: "a", a: x })
      i += 1
    } else if (y !== undefined) {
      steps.push({ kind: "b", b: y })
      j += 1
    }
  }
  return steps
}
