export function getRandomSubarray<T>(
  arr: ReadonlyArray<T>,
  k: number
): Array<T> {
  const n = arr.length
  if (k > n) {
    throw new Error("k cannot be greater than the length of the array")
  }

  const copy = [...arr]

  for (let i = 0; i < k; i++) {
    const j = Math.floor(Math.random() * (n - i))
    const ni = n - 1 - i

    const a = atOrThrow(copy, ni)
    const b = atOrThrow(copy, j)

    copy[ni] = b
    copy[j] = a
  }

  return copy.slice(n - k)
}

function atOrThrow<T>(arr: ReadonlyArray<T>, i: number): T {
  const v = arr[i]
  if (v === undefined) {
    throw new Error(`Index ${i} out of bounds`)
  }
  return v
}
