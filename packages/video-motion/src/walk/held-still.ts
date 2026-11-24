/**
 * A stage's screen once it holds still: screens taken `gapMs` apart until two
 * in a row are the same, at most `tries` more after the first. Every stage
 * that waits for a still screen waits here; what it does with one that never
 * held (keep the last, or refuse it) is the stage's.
 */
export async function heldStill(
  take: () => Promise<Buffer>,
  tries: number,
  gapMs: number
): Promise<{ readonly png: Buffer; readonly held: boolean }> {
  let last = await take()
  for (let i = 0; i < tries; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, gapMs))
    const next = await take()
    if (next.equals(last)) return { png: next, held: true }
    last = next
  }
  return { png: last, held: false }
}
