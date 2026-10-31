import type { Primer } from "@soundbites/lib/journal/primer"
import { readPrimer } from "@soundbites/lib/journal/primer"

export const AT = "2026-10-30T09:00:00.000Z"

/** A version 2 primer: three cuts, the second read word for word. */
export const PRIMER_TEXT = JSON.stringify({
  version: 2,
  title: "Playoff Delta, week 8",
  budgetSec: 120,
  voice: "mixed",
  cuts: [
    {
      id: "path",
      artifact: "The path card",
      point: "Following the model paid off this week",
      keep: ["3 of 4 picks hit", "The model said Detroit"],
      targetSec: 20,
    },
    {
      id: "miss",
      artifact: "The miss",
      point: "The one miss",
      line: "One pick missed, and here is why.",
      targetSec: 15,
    },
    {
      id: "next",
      artifact: "End card",
      point: "What week 9 tests",
      targetSec: 10,
    },
  ],
})

export function primer(): Primer {
  const reading = readPrimer(PRIMER_TEXT)
  if (!reading.ok) throw new Error(reading.problem)
  return reading.primer
}
