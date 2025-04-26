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

export function createSequentialCycler<T>(array: Array<T>, k: number = 1) {
  if (array.length === 0) return (): Array<T> => []

  k = Math.max(0, k)

  let currentIndex = 0

  return function getNextElements(): Array<T> {
    if (k === 0) return []

    const result: Array<T> = []

    for (let i = 0; i < k; i++) {
      result.push(array[(currentIndex + i) % array.length])
    }

    currentIndex = (currentIndex + k) % array.length

    return result
  }
}
