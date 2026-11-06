/**
 * Promise HS1, for the rounds wing: LeetType's incident session and its
 * session files, Rust Rounds, and Game Week (`./stays-put.spec.ts` holds
 * the claim).
 * - Family: every tap each walk below takes, at each of `PHONE_VIEWPORTS`;
 *   for the incident session, a pick (the round's boundary controls leave
 *   the header), a pick the log refuses with the rounds waiting open, and a
 *   record screen whose phone fills up; for its session files, a file
 *   picked; for Rust Rounds, Pin, a Pin the phone refuses, a note lost after
 *   moving on, a note an earlier opening left, an earlier note that will not
 *   play, and the tutor's page copied, refused the copy, and given a reply
 *   it cannot take; for Game Week, a microphone refused and an Undo too
 *   late. A tap that declares `reflows` (another screen, a step of the bite,
 *   a disclosure) is outside it, and says why.
 * - Proof: this spec, over `../layout-invariants/stays-put.ts`.
 * - Tolerance: a screen this spec does not walk.
 */

import type { MicScript } from "@some-ui/voice-capture/testing"
import {
  button,
  refuseWrites,
  toScreen,
  waitsFor,
  type Tap,
} from "@tests/layout-invariants/stays-put"

import { happens, tap, walkEachPhone, type Walk } from "./harness"
import { STRESS_SESSION } from "./panel-page/incident-session"

/** Waits for words to show, measured as what landed while nothing was tapped. */
const lands = (words: RegExp, does: string): Tap =>
  waitsFor((page) => page.getByText(words), does)

/** A microphone that hands a take over slowly. */
const SLOW: MicScript = {
  open: { kind: "after", ms: 0 },
  finish: { kind: "after", ms: 1_500 },
  level: 0.3,
  bytes: 5,
}

/** A microphone that will be refused. */
const REFUSED: MicScript = {
  open: { kind: "refuse", reason: "denied", ms: 0 },
  finish: { kind: "after", ms: 0 },
  level: 0.3,
  bytes: 5,
}

/** The session, from its card to a record screen whose phone fills up. */
const INCIDENT: ReadonlyArray<Tap> = [
  toScreen(/^Play /, "plays the session file"),
  toScreen(/the whole session/, "starts the whole session"),
  toScreen("Start with incident 1", "goes to the first round"),
  button(/^Three machines is too small/, "picks an option"),
  {
    ...button("Show the worked answer", "shows the worked answer"),
    reflows: "disclosure: the worked answer opens where its button was",
  },
  toScreen("Continue", "goes on to the reading"),
  {
    ...button("Rounds waiting", "opens the rounds waiting"),
    reflows: "disclosure: the rounds waiting open below the header",
  },
  {
    ...button("Rounds waiting", "closes the rounds waiting"),
    reflows: "disclosure: the rounds waiting close",
  },
  toScreen("Save it; this round waits", "saves the round for later"),
  {
    ...button("Rounds waiting", "opens the rounds waiting on a round"),
    reflows: "disclosure: the rounds waiting open below the header",
  },
  refuseWrites,
  button(/^Hear back from a majority/, "picks an option, refused"),
  toScreen("Continue", "goes on to the reading"),
  toScreen("Skip", "skips the take's choice"),
  toScreen(/^Incident 1: the writes/, "goes to the record screen"),
  happens("fill", "the phone fills up"),
  {
    ...button("Type it instead", "types the answer instead"),
    reflows: "mode: a typed answer is another form",
  },
]

/** LeetType's session files: one picked from storage. */
const SESSION_FILES: ReadonlyArray<Tap> = [
  {
    does: "picks a session file from storage",
    act: async (page): Promise<void> => {
      await page.locator("input[type=file]").setInputFiles({
        name: "t1-99-fit-stress.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(STRESS_SESSION)),
      })
      await page.getByText(/already on this phone/).waitFor()
    },
  },
]

/** A card pinned, then one pinned with the phone refusing the write. */
const RUST_PIN: ReadonlyArray<Tap> = [
  toScreen("Start", "starts the rounds"),
  button("Pin", "pins the card"),
  toScreen("Next", "goes on to the next card"),
  refuseWrites,
  button("Pin", "pins the card, refused"),
]

/** A note under way when the card is left, which the phone then fails to keep. */
const RUST_LOST: ReadonlyArray<Tap> = [
  happens("script", "the microphone hands a take over slowly", SLOW),
  happens("keeping", "the phone will not keep the next note", "failed"),
  toScreen("Start", "starts the rounds"),
  button("Start talking", "starts a note"),
  {
    does: "talks for a moment, then goes on while the note is kept",
    act: async (page): Promise<void> => {
      await page.waitForTimeout(1_200)
      await tap(page, "Next")
    },
    reflows: "screen: the next card",
  },
  lands(/couldn't be kept/, "the note is lost"),
]

/** A refine card whose earlier note neither the phone nor home has. */
const RUST_REFINE: ReadonlyArray<Tap> = [
  toScreen(/^borrowing/, "plays the refine card"),
  button("Play your earlier note", "plays the earlier note"),
  lands(/can't play right now/, "the earlier note will not play"),
]

/** The tutor's page: copied, a copy refused, and a reply it can't take. */
const RUST_TUTOR: ReadonlyArray<Tap> = [
  toScreen("Tutor", "opens the tutor's page"),
  button("Copy for a tutor", "copies for a tutor"),
  happens("refuseCopy", "the clipboard refuses"),
  button("Copy for a tutor", "copies for a tutor, refused"),
  {
    does: "pastes a reply",
    act: (page) =>
      page.getByLabel("The tutor's reply").fill("not a round at all"),
  },
  button("Take it", "takes the reply, which can't be taken"),
  button("Copy what to fix", "copies what to fix, refused"),
]

/** A card's note an earlier opening left: the app opened again over it. */
const RUST_REOPEN: ReadonlyArray<Tap> = [
  toScreen("Start", "starts the rounds"),
  button("Start talking", "starts a note, and the app goes away"),
  {
    does: "opens the app again, over a note it never heard end",
    act: async (page): Promise<void> => {
      await page.reload({ waitUntil: "load" })
      await page.getByText(/wasn't kept/).waitFor()
    },
    reflows: "screen: the app, opened again",
  },
  button("Start talking", "says it again"),
]

/** Game Week: a bite kept, Undo too late, then the microphone refused. */
const GAME_WEEK: ReadonlyArray<Tap> = [
  {
    ...button(/3rd & 9 at the SEA 38/, "says the likeliest scenario"),
    reflows: "step: the bite records in place of the offers",
  },
  {
    ...button("Stop, and keep it", "keeps the bite"),
    reflows: "step: back to the offers, the bite's row below",
  },
  happens("refuseUndo", "the bite is on its way home"),
  button("Undo", "undoes it, too late"),
  happens("script", "the microphone will be refused", REFUSED),
  button("Say it first", "says it first, the microphone refused"),
]

const walk = (
  panel: string,
  ready: RegExp,
  taps: ReadonlyArray<Tap>,
  label: string
): Walk => ({ panel, ready, taps, label, freshStorage: true })

// Each walk opens on an empty phone: what an earlier walk kept is gone.
walkEachPhone("a tap moves nothing it leaves on the screen (HS1, rounds)", [
  walk("rounds-incident", /^Play /, INCIDENT, "incident session"),
  walk("rounds-incident", /^Play /, SESSION_FILES, "session files"),
  walk("rounds-rust", /^Start$/, RUST_PIN, "rust rounds, pin"),
  walk("rounds-rust", /^Start$/, RUST_LOST, "rust rounds, a lost note"),
  walk("rounds-rust", /^Tutor$/, RUST_TUTOR, "rust rounds, tutor"),
  walk("rounds-rust-refine", /^borrowing/, RUST_REFINE, "rust rounds, refine"),
  walk("rounds-game-week", /^Say it first$/, GAME_WEEK, "game week"),
  walk("rounds-rust", /^Start$/, RUST_REOPEN, "rust rounds, reopen"),
])
