/**
 * Promise HS1, for the rounds wing: LeetType's incident session and its
 * session files, Rust Rounds, and Game Week (`./stays-put.spec.ts` has the
 * claim and the measure; this file adds walks to its Family).
 * - Claim: on these phone screens, a tap that leaves you on the screen
 *   moves no tap target still on it.
 * - Family: every tap each walk below takes, at each of `PHONE_VIEWPORTS`;
 *   for the incident session, a pick (the round's boundary controls leave
 *   the header), a pick the log refuses with the rounds waiting open, and a
 *   record screen whose phone fills up; for its session files, a file picked; for Rust Rounds, Pin,
 *   a Pin the phone refuses, a note lost after moving on, a note an earlier
 *   opening left, an earlier note that will not play, and the tutor's page
 *   copied, refused the copy, and given a reply it cannot take; for Game
 *   Week, a microphone refused and an Undo too late. A tap that declares
 *   `reflows` (another screen, a step of the bite, a disclosure) is outside
 *   it, and says why.
 * - Proof: this spec, over `../layout-invariants/stays-put.ts`, whose own
 *   blind spot `./stays-put.spec.ts` plants.
 * - Tolerance: a screen this spec does not walk.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:ui-fit tests/ui-fit/stays-put-rounds.spec.ts
 */

import { expect, test, type Page } from "@playwright/test"
import type { MicScript } from "@some-ui/voice-capture/testing"
import { holdStill, type Tap } from "@tests/layout-invariants/stays-put"

import { PHONE_VIEWPORTS, servePhonePage, tap } from "./harness"
import { STRESS_SESSION } from "./panel-page/incident-session"
import type { RoundsLevers } from "./phone-page/rounds"

const PAGE = servePhonePage()

test.describe.configure({ timeout: 3 * 60 * 1000 })

const button = (name: string | RegExp, does: string): Tap => ({
  does,
  act: (page) => tap(page, name),
})

/** A tap onto another screen: a new layout, so nothing is held. */
const toScreen = (name: string | RegExp, does: string): Tap => ({
  ...button(name, does),
  reflows: `screen: ${does}`,
})

/** From here on, the phone keeps nothing: every write is refused. */
const refuseWrites: Tap = {
  does: "the phone stops keeping writes",
  act: (page): Promise<void> =>
    page.evaluate(() => {
      Storage.prototype.setItem = (): never => {
        throw new DOMException("full", "QuotaExceededError")
      }
    }),
}

/** A lever the fixture answers (`./phone-page/rounds.tsx`), and what it is pulled with. */
type Pull =
  | readonly ["fill" | "refuseCopy" | "refuseUndo"]
  | readonly ["keeping", Parameters<RoundsLevers["keeping"]>[0]]
  | readonly ["script", MicScript]

/** Moves a fake the fixture set, as the phone would. */
const lever = (does: string, pull: Pull): Tap => ({
  does,
  act: (page): Promise<void> =>
    page.evaluate((pulled) => {
      const levers = window.__rounds
      if (levers === undefined) throw new Error("No rounds fixture mounted.")
      switch (pulled[0]) {
        case "keeping": {
          levers.keeping(pulled[1])
          return
        }
        case "script": {
          levers.script(pulled[1])
          return
        }
        case "fill":
        case "refuseCopy":
        case "refuseUndo": {
          levers[pulled[0]]()
          return
        }
        default: {
          throw new Error(`No lever ${String(pulled satisfies never)}.`)
        }
      }
    }, pull),
})

/** Waits for words to show, measured as what landed while nothing was tapped. */
const lands = (words: RegExp, does: string): Tap => ({
  does,
  act: (page) => page.getByText(words).first().waitFor(),
})

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
  lever("the phone fills up", ["fill"]),
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
  lever("the microphone hands a take over slowly", [
    "script",
    {
      open: { kind: "after", ms: 0 },
      finish: { kind: "after", ms: 1_500 },
      level: 0.3,
      bytes: 5,
    },
  ]),
  lever("the phone will not keep the next note", ["keeping", "failed"]),
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
  lever("the clipboard refuses", ["refuseCopy"]),
  button("Copy for a tutor", "copies for a tutor, refused"),
  {
    does: "pastes a reply",
    act: (page) =>
      page.getByLabel("The tutor's reply").fill("not a round at all"),
  },
  button("Take it", "takes the reply, which can't be taken"),
  button("Copy what to fix", "copies what to fix, refused"),
]

/** A card's note an earlier opening left, before and after reopening. */
const RUST_BEFORE_REOPEN: ReadonlyArray<Tap> = [
  toScreen("Start", "starts the rounds"),
  button("Start talking", "starts a note, and the app goes away"),
]

const RUST_AFTER_REOPEN: ReadonlyArray<Tap> = [
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
  lever("the bite is on its way home", ["refuseUndo"]),
  button("Undo", "undoes it, too late"),
  lever("the microphone will be refused", [
    "script",
    {
      open: { kind: "refuse", reason: "denied", ms: 0 },
      finish: { kind: "after", ms: 0 },
      level: 0.3,
      bytes: 5,
    },
  ]),
  button("Say it first", "says it first, the microphone refused"),
]

async function open(
  page: Page,
  panel: string,
  ready: RegExp
): Promise<Array<string>> {
  const errors: Array<string> = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(PAGE.url(panel), { waitUntil: "load" })
  // Each walk opens on an empty phone: what an earlier walk kept is gone.
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: "load" })
  await page.getByRole("button", { name: ready }).first().waitFor()
  return errors
}

test.describe("a tap moves nothing it leaves on the screen (HS1, rounds)", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    test(`rounds at ${phone.name} (${phone.width}x${phone.height})`, async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const failures: Array<string> = []

      const walks = [
        ["rounds-incident", /^Play /, INCIDENT, "incident session"],
        ["rounds-incident", /^Play /, SESSION_FILES, "session files"],
        ["rounds-rust", /^Start$/, RUST_PIN, "rust rounds, pin"],
        ["rounds-rust", /^Start$/, RUST_LOST, "rust rounds, a lost note"],
        ["rounds-rust", /^Tutor$/, RUST_TUTOR, "rust rounds, tutor"],
        [
          "rounds-rust-refine",
          /^borrowing/,
          RUST_REFINE,
          "rust rounds, refine",
        ],
        ["rounds-game-week", /^Say it first$/, GAME_WEEK, "game week"],
      ] as const
      for (const [panel, ready, taps, label] of walks) {
        const errors = await open(page, panel, ready)
        failures.push(...(await holdStill(page, taps, label)))
        expect(errors, `${label}: ${errors.join("\n")}`).toEqual([])
      }

      // The app opened again over a note it never heard end: a reload.
      const errors = await open(page, "rounds-rust", /^Start$/)
      failures.push(
        ...(await holdStill(page, RUST_BEFORE_REOPEN, "rust rounds, reopen"))
      )
      await page.reload({ waitUntil: "load" })
      await page.getByText(/wasn't kept/).waitFor()
      failures.push(
        ...(await holdStill(page, RUST_AFTER_REOPEN, "rust rounds, reopened"))
      )
      expect(errors, errors.join("\n")).toEqual([])

      expect(failures, failures.join("\n")).toEqual([])
    })
  }
})
