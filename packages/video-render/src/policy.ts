/**
 * What a render may take, set as policy (paulgsc/some-ui#2635): a video
 * that would pass its length or size is refused, saying which cap and by
 * how much, rather than rendered; a step cache that would pass its budget
 * stops keeping steps, with a warning, and the render goes on uncached.
 * The owner changes a cap by changing the caller's flags (the weekly call's
 * worker passes them in paulgsc/server `infra/render/render-calls.sh`);
 * these are the defaults.
 */
export type RenderPolicy = {
  /** The longest video rendered, in ms. Checked before anything is encoded. */
  readonly maxVideoMs: number
  /** The largest finished video, in bytes. A larger one is removed. */
  readonly maxVideoBytes: number
  /** What one video's step cache may hold, in bytes. */
  readonly cacheBytes: number
}

export const MB = 1024 * 1024

export const DEFAULT_POLICY: RenderPolicy = {
  maxVideoMs: 15 * 60_000,
  maxVideoBytes: 500 * MB,
  cacheBytes: 2048 * MB,
}

const minutes = (ms: number): string => (ms / 60_000).toFixed(1)
const megabytes = (bytes: number): string => (bytes / MB).toFixed(0)

/** Why a video of `ms` is refused, or null when the policy allows it. */
export function overLength(ms: number, policy: RenderPolicy): string | null {
  return ms > policy.maxVideoMs
    ? `the video would run ${minutes(ms)} min, past the policy's ${minutes(policy.maxVideoMs)} min`
    : null
}

/** Why a finished video of `bytes` is refused, or null when it is allowed. */
export function overSize(bytes: number, policy: RenderPolicy): string | null {
  return bytes > policy.maxVideoBytes
    ? `the video is ${megabytes(bytes)} MB, past the policy's ${megabytes(policy.maxVideoBytes)} MB`
    : null
}

/** The warning when a step is not kept because the cache is full. */
export function overBudget(
  what: string,
  bytes: number,
  held: number,
  policy: RenderPolicy
): string {
  return (
    `not cached: ${what} (${megabytes(bytes)} MB) would take the step cache ` +
    `from ${megabytes(held)} MB past the policy's ${megabytes(policy.cacheBytes)} MB; ` +
    `it runs again on a retry`
  )
}
