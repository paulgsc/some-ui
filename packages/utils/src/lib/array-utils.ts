export function getRandomSubarray<T>(arr: Array<T>, k: number): Array<T> {
  const n = arr.length
  if (k > n) {
    throw new Error("k cannot be greater than the length of the array")
  }

  const copy = [...arr]

  for (let i = 0; i < k; i++) {
    const j = Math.floor(Math.random() * (n - i))
    ;[copy[n - 1 - i], copy[j]] = [copy[j], copy[n - 1 - i]]
  }

  return copy.slice(n - k)
}
