import type { ReactNode } from "react"
import { getRandomSubarray } from "some-ui-utils"

export function processArray<T extends ReactNode>(
  arr: Array<T>,
  k: number
): Array<ReactNode> {
  const placeholder = "placeholder string"

  if (arr.length < k) {
    const padding = Array(k - arr.length).fill(placeholder)
    return arr.concat(padding)
  } else if (arr.length === k) {
    return arr
  }
  return getRandomSubarray<T>(arr, k)
}
