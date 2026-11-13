/**
 * Promise HS1.
 * - Claim: on a phone screen, a tap or key that leaves you on that screen
 *   moves no tap target still on it, and what the app says about it (a
 *   refusal, a "Typo?", a hint, progress) is said on the notice plane over
 *   the screen, never as a line in its layout or a blank kept for one; the
 *   layout changes only for content asked for, below what was tapped.
 * - Family: every tap each walk below takes, at each of `PHONE_VIEWPORTS`
 *   (the phone held sideways among them); for aph's logger, mine and theirs,
 *   every digit from an empty figure to one past the longest, approx on and
 *   off, each checkpoint, a label, an earlier and a later day, a save kept
 *   and a save refused; for History's entry sheet, my figure retyped, approx,
 *   a save refused, a label tapped off down to the last one; for History's
 *   drafts, a submit refused. A tap that declares `reflows` (Mine/Theirs) is
 *   outside it, and says why; one that declares `grows` ("N older") is in it
 *   for what is at and above it.
 * - Proof: this spec, which takes every tap, compares every target's box
 *   before and after and finds every message in the layout
 *   (`../layout-invariants/stays-put.ts`), and fails on the planted line if
 *   the measure goes blind to either.
 * - Tolerance: a screen this spec does not walk.
 */

import { expect, test } from "@playwright/test"
import {
  button,
  holdStill,
  refuseWrites,
  type Scope,
  type Tap,
} from "@tests/layout-invariants/stays-put"

import { open, walkEachPhone } from "./harness"

const inSheet: Scope = (page) => page.getByRole("dialog")

const key = (k: string): Tap => button(k, `types ${k}`, { exact: true })

const radio = (name: string | RegExp, does: string): Tap => ({
  does,
  act: (page) => page.getByRole("radio", { name }).first().click(),
})

/** The logger, mine: 51,000 typed digit by digit, one past the last digit, and saved. */
const LOG_MINE: ReadonlyArray<Tap> = [
  key("5"),
  key("1"),
  key("0"),
  key("0"),
  key("0"),
  // A sixth digit, past MAX_DIGITS (lib/draft.ts): refused, and still nothing moves.
  key("0"),
  key("Delete digit"),
  button("~ approx", "turns approx off"),
  button("~ approx", "turns approx on"),
  button(/^Plus/, "nudges up"),
  button(/^Minus/, "nudges down"),
  radio(/12:00/, "picks 12:00"),
  radio(/Other/, "picks Other"),
  radio(/7:00/, "picks 7:00"),
  button("no-bs", "labels it no-bs"),
  button(/^Save/, "saves a draft"),
  button("Earlier day", "goes a day back, while today holds a draft"),
  button("Later day", "comes back to today"),
  refuseWrites,
  key("9"),
  button(/^(Save|Replace)/, "saves, refused"),
]

/** The logger, theirs: a figure typed against the newest entry waiting. */
const LOG_THEIRS: ReadonlyArray<Tap> = [
  {
    ...radio(/^Theirs/, "switches to theirs"),
    reflows: "mode: theirs is another form, with no day or labels",
  },
  key("5"),
  key("1"),
  key("0"),
  key("0"),
  key("0"),
  key("0"),
  key("Delete digit"),
  {
    ...button(/older$/, "shows the older entries"),
    grows: "the older entries, below the ones shown",
  },
  refuseWrites,
  button(/^Save theirs/, "saves theirs, refused"),
]

/** History's entry sheet, on an entry awaiting theirs. */
const ENTRY_SHEET: ReadonlyArray<Tap> = [
  {
    does: "opens an entry",
    act: (page) =>
      page
        .getByRole("button", { name: /^[0-9:]+: Awaiting/ })
        .first()
        .click(),
    reflows: "screen: the sheet opens",
  },
  {
    does: "retypes my figure",
    act: (page) =>
      inSheet(page).getByRole("textbox", { name: /mine/i }).fill("51000"),
  },
  button("~ approx", "turns approx off", { scope: inSheet }),
  button("~ approx", "turns approx on", { scope: inSheet }),
  button("no-bs", "labels it no-bs", { scope: inSheet }),
  button("w-o-bs", "labels it w-o-bs", { scope: inSheet }),
  button("no-bs", "takes no-bs off", { scope: inSheet }),
  refuseWrites,
  button("Save", "saves my figure, refused", { scope: inSheet }),
]

/** History's drafts, after the logger saved one. */
const DRAFTS: ReadonlyArray<Tap> = [
  button("Pick all", "picks every draft"),
  refuseWrites,
  button(/^Submit/, "submits, refused"),
]

// Each walk on a fresh page: the writes are kept again, and the draft the
// first saved stays in this page's storage for History.
walkEachPhone(
  "a tap moves nothing it leaves on the screen (HS1)",
  [
    { panel: "aph-log", taps: LOG_MINE, label: "aph log, mine" },
    { panel: "aph-log", taps: LOG_THEIRS, label: "aph log, theirs" },
    { panel: "aph-history", taps: DRAFTS, label: "aph history, drafts" },
    { panel: "aph-history", taps: ENTRY_SHEET, label: "aph entry sheet" },
  ],
  (PAGE) => {
    test("the measure sees a planted shift, and the line that made it", async ({
      page,
    }) => {
      PAGE.expectBuilt()
      await open(page, PAGE.url("planted-shift"))
      const failures = await holdStill(
        page,
        [button("Bring a line up", "brings a line up")],
        "planted"
      )
      expect(
        failures.some((f) => f.includes("Planted target")),
        `A line mounted above "Planted target" moves it. If this is not ` +
          `reported, every walk below measures nothing: ${failures.join("\n")}`
      ).toBe(true)
      expect(
        failures.some((f) => f.includes("takes room in the screen")),
        `The planted line is an alert in the screen's flow. If this is not ` +
          `reported, no walk sees a message said in the layout: ${failures.join(
            "\n"
          )}`
      ).toBe(true)
    })
  }
)
