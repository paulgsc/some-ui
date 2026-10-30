/**
 * Sample data for each kind, for the preview page and the tests: what a
 * video's cut list would carry. Captions' sample lines are in
 * `./captions/sample`; the Build Journal kinds' are a made-up episode. The
 * authorship sample has a scene for each of the five ways an idea comes
 * about, each with different hands, between its intro and its end card,
 * timed into the preview's six seconds.
 */

import type { BurnInData, Kind } from "./burn-in"
import { SAMPLE } from "./captions/sample"

/** How long the preview plays a kind whose text holds still. */
export const STILL_SAMPLE_MS = 6000

export const SAMPLES: Readonly<Record<Kind, BurnInData["params"]>> = {
  captions: { lines: SAMPLE },
  headline: {
    kicker: "BUILD JOURNAL · SHORT 7",
    headline: "Every word on screen comes from one place",
    line: "Phone build, recorded in a browser · sound off  ·  Studio",
  },
  card: {
    kicker: "BUILD JOURNAL · SHORT 7",
    headline: "What the video draws, and what it films",
    body: "Takes, footage and a background picked for one video stay in Drive. Subtitles, cards and the mark of who made what are drawn the same way into every one.",
    note: "So changing how a card looks changes it for the next video, and never for one already up.",
  },
  authorship: {
    scenes: [
      { startMs: 0, origin: "agent", wording: "agent", hands: ["code"] },
      { startMs: 1800, origin: "you", wording: "you", hands: ["you", "code"] },
      {
        startMs: 2500,
        origin: "you",
        wording: "agent",
        hands: ["you", "agent", "code"],
      },
      { startMs: 3200, origin: "agent", wording: "agent", hands: ["code"] },
      {
        startMs: 3900,
        origin: "agent",
        wording: "you",
        hands: ["you", "code"],
      },
      {
        startMs: 4600,
        origin: "source",
        wording: "agent",
        hands: ["agent", "code"],
      },
      { startMs: 5300, origin: "agent", wording: "agent", hands: ["code"] },
    ],
    endMs: STILL_SAMPLE_MS,
  },
}
