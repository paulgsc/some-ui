/**
 * Which engine owns a tab: the `enforcementSheetEnabled` flag, read once
 * under the veil by `content.ts` and `frame.ts`.
 *
 * Bounded. The read gates the whole start, so a storage read that never
 * settles (storage can stall while the extension updates) held the veil with
 * nothing left to release it (ADR 0002 §8.7). Unanswered within
 * `ENFORCEMENT_FLAG_READ_MS`, unreadable, or anything but `true` is off: the
 * classifier is the default engine.
 */

export const ENFORCEMENT_FLAG_KEY = "enforcementSheetEnabled"

/** Well under `VEIL_MAX_HOLD_MS`, so a stalled read still leaves the start time to run. */
export const ENFORCEMENT_FLAG_READ_MS = 500

type StorageGet = (keys: Array<string>) => Promise<Record<string, unknown>>

export async function readEnforcementFlag(
  get: StorageGet,
  timeoutMs: number = ENFORCEMENT_FLAG_READ_MS
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const unanswered = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      resolve(false)
    }, timeoutMs)
  })
  // Through a `.then` so a synchronous throw from `get` is unreadable too.
  const read = Promise.resolve()
    .then(() => get([ENFORCEMENT_FLAG_KEY]))
    .then(
      (data) => data[ENFORCEMENT_FLAG_KEY] === true,
      () => false
    )
  try {
    return await Promise.race([read, unanswered])
  } finally {
    clearTimeout(timer)
  }
}
