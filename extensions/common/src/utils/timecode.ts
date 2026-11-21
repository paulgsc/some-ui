/**
 * A length as `m:ss`, the way a clock reads: the extensions' copy of
 * `@some-ui/core-utils`' `formatTimecode`, which extensions do not bundle
 * (#2112). Floors to the whole second; minutes past an hour keep counting.
 */
export function formatTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`
}
