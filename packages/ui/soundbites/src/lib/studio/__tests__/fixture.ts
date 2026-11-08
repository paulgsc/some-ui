import type { Format } from "@some-ui/video-render"
import { FORMAT_SCHEMA } from "@some-ui/video-render"
import { episodeOf } from "@some-ui/video-render/testing"
import type { StartRecording } from "@some-ui/voice-capture"
import { simulatedMicrophone, SPEAKING } from "@some-ui/voice-capture/testing"
import { primerOf } from "@soundbites/fixtures"
import type { Primer } from "@soundbites/lib/journal/primer"

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

export const primer = (): Primer => primerOf(PRIMER_TEXT)

const WEEKLY: Format = {
  schema: FORMAT_SCHEMA,
  id: "weekly",
  version: 1,
  title: "Weekly",
  series: { id: "weekly", version: 1 },
  look: "calm",
  scenes: ["open", "close"].map((id) => ({
    id,
    name: `The ${id}`,
    point: `How it ${id}s`,
    picture: { kind: "capture", from: "a slide", cssWidth: 1080 },
    holdMs: 6_000,
  })),
}

/** An episode file of the show Weekly, for `period`: two scenes over clips. */
export function episodeText(period = "week 3", sum = "a"): string {
  const made = episodeOf(WEEKLY, {
    show: "Weekly",
    title: `Weekly, ${period}`,
    period,
    data: { source: `weekly/${period}.json`, sha256: sum.repeat(64) },
    upload: {
      title: `Weekly · ${period}`,
      description: `Weekly, ${period}, as it went.`,
    },
    keep: [["3 wins"], ["One loss"]],
    inMs: (i) => 900 + i,
  })
  if (!made.ok) throw new Error(made.problems.join("; "))
  return JSON.stringify(made.value)
}

/**
 * The shared simulated microphone (`@some-ui/voice-capture/testing`),
 * hearing `durationMs` of speech per take, `bytes` of it: it opens at once
 * and never refuses.
 */
export function speaking(durationMs = 4_000, bytes = 5): StartRecording {
  return simulatedMicrophone({
    now: Date.now,
    fallback: { ...SPEAKING, durationMs, bytes },
  }).startRecording
}
