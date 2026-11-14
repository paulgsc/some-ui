/**
 * Sample data for each kind, for the preview page and the tests: what a
 * video's cut list would carry. Captions' sample lines are in
 * `./captions/sample`; the Build Journal kinds' are a made-up episode. The
 * authorship sample has a scene for each of the five ways an idea comes
 * about, each with different hands, between its intro and its end card,
 * timed into the preview's six seconds. The game cards have one sample per
 * template, made up around a 49ers game late in a season.
 */

import type { BurnInData, Kind } from "./burn-in"
import { SAMPLE } from "./captions/sample"
import type { GameCardParams, GameCardTemplate } from "./game-card"

/** How long the preview plays a kind whose text holds still. */
export const STILL_SAMPLE_MS = 6000

/** A game card for each template, as the shot writer would fill one. */
export const GAME_CARD_SAMPLES: Readonly<
  Record<GameCardTemplate, GameCardParams>
> = {
  stat: {
    template: "stat",
    team: "SF",
    down: 3,
    toGo: 8,
    margin: -4,
    quarter: 4,
    left: "1:52",
  },
  score: {
    template: "score",
    away: { team: "SF", points: 17 },
    home: { team: "SEA", points: 21 },
    when: { quarter: 4, left: "1:52" },
  },
  scenario: {
    template: "scenario",
    scenario: "in.third-long",
    outcome: "converted",
  },
  chain: {
    template: "chain",
    kicker: "One drive, start to finish",
    steps: [
      { scenario: "in.third-long", outcome: "converted" },
      { scenario: "in.red-zone", outcome: "touchdown" },
      { text: "SF lead the division with two weeks left" },
    ],
  },
  path: {
    template: "path",
    team: "SF",
    week: 15,
    paths: [null, 7, 6, 5, 2],
  },
}

/** The sample card. */
const CARD = {
  kicker: "BUILD JOURNAL · SHORT 7",
  headline: "What the video draws, and what it films",
  body: "Takes, footage and a background picked for one video stay in Drive. Subtitles, cards and the mark of who made what are drawn the same way into every one.",
  note: "So changing how a card looks changes it for the next video, and never for one already up.",
}

/** The sample card without its note, which the 16:9 video's shorter body has no room for. */
export const CARD_WITHOUT_NOTE = { ...CARD, note: "" }

/** What the sample cards are stamped with: the commit CARDS1 landed in. */
const SAMPLE_STAMP = {
  sources: ["paulgsc/some-ui@5f3dd29"],
  date: "2026-11-14",
}

/** One sample for each kind but a game card, which has one per template. */
export const SAMPLES: Readonly<
  Record<Exclude<Kind, "game-card">, BurnInData["params"]>
> = {
  captions: { lines: SAMPLE },
  headline: {
    kicker: "BUILD JOURNAL · SHORT 7",
    headline: "Every word on screen comes from one place",
    line: "Phone build, recorded in a browser · sound off  ·  Studio",
  },
  card: CARD,
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
  "preview-mark": {},
  // An open PR, shown first in its video, so it spells itself out.
  "status-badge": { badge: "pr" },
  terminal: {
    kicker: "TERMINAL · THE SCRATCHPAD",
    title: "What the binding runs",
    stamp: SAMPLE_STAMP,
    bar: "scratchpad",
    lines: [
      { comment: "# a sample: the commands are made up", badge: "next" },
      {
        prompt: "$",
        keyword: "scratch run foo.rs",
        comment: "  # compile, lint, run",
        badge: "main",
      },
      {
        prompt: "$",
        keyword: "scratch watch foo.rs",
        comment: "  # on every save",
        badge: "pr",
      },
      { prompt: "$", text: "export API_KEY=<from the vault>", badge: "you" },
      { comment: "# std only: no crates", badge: "gap" },
    ],
  },
  "cheat-sheet": {
    kicker: "CHEAT SHEET · A SAMPLE",
    title: "When you want it now",
    stamp: SAMPLE_STAMP,
    rows: [
      {
        badge: "you",
        task: "Upgrade now",
        command: "sudo upgrade --now",
        note: "The same path the nightly run takes.",
      },
      { badge: "main", task: "Watch it", command: "journalctl -fu upgrade" },
      { badge: "pr", task: "Read the verdict", command: "cat report.md" },
      {
        badge: "gap",
        task: "Reload after a change",
        command: "reload --config <file>",
        note: "The made-up binding reads the old path.",
      },
    ],
  },
  legend: {
    kicker: "LEGEND · A SAMPLE",
    title: "Reading the badges",
    stamp: SAMPLE_STAMP,
  },
  rule: {
    kicker: "RULE · A SAMPLE",
    title: "How stale is this card?",
    stamp: SAMPLE_STAMP,
    sources: ["make help", "the README"],
    wins: "the README",
  },
}

export const samplesOf = (kind: Kind): ReadonlyArray<BurnInData["params"]> =>
  kind === "game-card" ? Object.values(GAME_CARD_SAMPLES) : [SAMPLES[kind]]
