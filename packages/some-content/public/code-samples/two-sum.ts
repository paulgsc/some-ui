/**
 * Two Sum
 *
 * Given an array of integers `nums` and an integer `target`, return the
 * indices of the two numbers that add up to `target`.
 *
 * Trades a second pass for O(1) lookups: a single scan builds up `seen`
 * while checking, at each index, whether this number's complement has
 * already been visited.
 */
export function twoSum(nums: number[], target: number): [number, number] {
  const seen = new Map<number, number>()

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i]!
    const match = seen.get(complement)
    if (match !== undefined) {
      return [match, i]
    }
    seen.set(nums[i]!, i)
  }

  throw new Error("no two sum solution")
}
