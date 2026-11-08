/**
 * The call template's sample week, for this package's tests. Kept out of
 * `src/testing.ts`, which www's Playwright specs load: `call.ts` imports its
 * sample as JSON with no import attribute, which only vitest's loader takes.
 */
import { sampleCallWeek } from "@video-render/call"
import type { CallWeek } from "@video-render/call"

/** The sample week, or a throw naming why it isn't one. */
export function sampleWeek(): CallWeek {
  const parsed = sampleCallWeek()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}
