/**
 * Promise HS1, for Studio's wing, `@some-ui/soundbites` (`./stays-put.spec.ts`
 * holds the claim).
 * - Family: every tap each walk below takes, at each of `PHONE_VIEWPORTS`
 *   (the phone held sideways among them); for New idea, a format, a title
 *   typed, a subject and a keyword picked and unpicked, a take started, kept
 *   and said again, the look-over's Play and Stop, and a take the microphone
 *   refused; for Studio's Shape, every plan tapped, each look and voice, below
 *   and above the one open; for Record, a take started, kept, recorded again
 *   and thrown away; for "Not today?" on a full phone, the one replaced next
 *   picked twice, Play and Stop, and a set-aside refused; for takes on home,
 *   a Play still loading, a Play home can't give back, a search refused as
 *   too long and retyped; for home's lists, a subject typed past the longest
 *   and back. A tap that declares `reflows` (another screen, a take kept as
 *   its scene's or answer's first row) is outside it, and says why.
 * - Proof: this spec, over `../layout-invariants/stays-put.ts`.
 * - Tolerance: a screen this spec does not walk, among them Watch, Start's
 *   "when takes leave the phone", Finish's "made on home", answering
 *   Claude's questions and the idea shelf.
 */

import {
  button,
  toScreen,
  waitsFor,
  type Tap,
} from "@tests/layout-invariants/stays-put"

import { walkEachPhone } from "./harness"

/** Waits for `name` to be offered, so the next tap starts from a still screen. */
const until = (name: string | RegExp, does: string): Tap =>
  waitsFor((page) => page.getByRole("button", { name }), does)

/**
 * Stops the take under way and waits for it to be kept. A take on a short
 * scene can reach its cap and stop itself first; then there is nothing to tap.
 */
const keep = (does: string, kept = "Record it again"): Tap => ({
  does,
  act: async (page): Promise<void> => {
    const stop = page.getByRole("button", { name: "Stop, and keep it" })
    if (await stop.isVisible()) await stop.click({ timeout: 2_000 })
    await page.getByRole("button", { name: kept }).waitFor()
  },
})

/** New idea: what it is, then the first question, said, kept and said again. */
const IDEA: ReadonlyArray<Tap> = [
  {
    does: "types a title",
    act: (page) =>
      page.getByRole("textbox", { name: "Title" }).fill("Two hearings"),
  },
  {
    does: "types a longer title",
    act: (page) =>
      page
        .getByRole("textbox", { name: "Title" })
        .fill("Two hearings, one word, and the week after"),
  },
  button(/^Video/, "makes it for a wide video"),
  {
    does: "picks the first subject",
    act: (page) =>
      page
        .getByRole("group", { name: /^Subject/ })
        .getByRole("button")
        .first()
        .click(),
  },
  {
    does: "picks the first keyword",
    act: (page) =>
      page
        .getByRole("group", { name: /^Keywords/ })
        .getByRole("button")
        .first()
        .click(),
  },
  {
    does: "unpicks the first keyword",
    act: (page) =>
      page
        .getByRole("group", { name: /^Keywords/ })
        .getByRole("button")
        .first()
        .click(),
  },
  toScreen("Start the questions", "opens the first question"),
  button("Start talking", "starts a take"),
  {
    ...keep("keeps the answer's first take"),
    reflows: "disclosure: the answer's first take, as a row under the button",
  },
  button("Record it again", "says it again"),
  keep("keeps the second take"),
  toScreen("Look it over before sending", "opens the idea looked over"),
  button(/^Play the take/, "plays the answer"),
  button(/^Stop the take/, "stops it"),
]

/** New idea, where the microphone refuses the first take. */
const IDEA_REFUSED: ReadonlyArray<Tap> = [
  {
    does: "types a title",
    act: (page) =>
      page.getByRole("textbox", { name: "Title" }).fill("Two hearings"),
  },
  toScreen("Start the questions", "opens the first question"),
  button("Start talking", "starts a take the microphone refuses"),
  until("Type it this once", "waits for the refusal"),
]

/** Studio's Shape: every plan, below the one open and above it. */
const SHAPE: ReadonlyArray<Tap> = [
  toScreen(/^Shape /, "opens Shape"),
  button(/^Plain/, "picks Plain"),
  button(/^Lively/, "picks Lively, below the one open"),
  button(/^Calm/, "picks Calm, above the one open"),
  button(/^Plain/, "picks Plain, above the one open"),
  toScreen("Next", "opens the voice"),
  button(/^Ad-lib/, "picks Ad-lib"),
  button(/^Mixed/, "picks Mixed, below the one open"),
  button(/^Read/, "picks Read, above the one open"),
]

/** Studio's Record, scene 1 before any take. */
const RECORD: ReadonlyArray<Tap> = [
  toScreen(/^Record /, "opens Record"),
  button("Start talking", "starts a take"),
  {
    ...keep("keeps the scene's first take"),
    reflows: "disclosure: the scene's first take, as a row under the button",
  },
  button("Record it again", "records it again"),
  button("Throw it away", "throws the new take away"),
  until("Record it again", "waits for the take to go"),
]

/** "Not today?", full: which one the next replaces, picked and refused. */
const SOUNDBITES: ReadonlyArray<Tap> = [
  until("Replace this one next instead", "waits for the list"),
  button("Replace this one next instead", "picks one to replace next"),
  button("Replace this one next instead", "picks another to replace next"),
  button(/^Play the take/, "plays one"),
  button(/^Stop the take/, "stops it"),
  button(/^Let it go/, "sets one aside, refused"),
]

/** Takes on home: one take loading, one home can't give back, a search too long. */
const LIBRARY: ReadonlyArray<Tap> = [
  until("Play this take", "waits for the takes"),
  {
    does: "plays a take whose audio is still coming",
    act: (page) =>
      page.getByRole("button", { name: "Play this take" }).nth(0).click(),
  },
  {
    does: "plays a take home can't give back",
    act: (page) =>
      page.getByRole("button", { name: "Play this take" }).nth(0).click(),
  },
  {
    does: "types a search one past the longest",
    act: (page) =>
      page.getByRole("searchbox").fill("the path card ".repeat(15)),
  },
  button(/^Search$/, "searches, refused as too long"),
  {
    does: "brings the search back under the longest",
    act: (page) => page.getByRole("searchbox").fill("the path card"),
  },
]

/** Home's lists: a new subject typed one past the longest, and back. */
const LISTS: ReadonlyArray<Tap> = [
  until("Add", "waits for the lists"),
  {
    does: "types a subject one past the longest",
    act: (page) =>
      page
        .getByRole("textbox", { name: "A new subject" })
        .fill("A subject that runs past forty characters"),
  },
  {
    does: "brings it back under the longest",
    act: (page) =>
      page.getByRole("textbox", { name: "A new subject" }).fill("A subject"),
  },
]

// Each walk on a fresh page, so each starts from its fixture's state.
walkEachPhone("a tap moves nothing it leaves on Studio's screens (HS1)", [
  { panel: "idea", taps: IDEA, label: "new idea" },
  { panel: "idea-voice-lost", taps: IDEA_REFUSED, label: "new idea, refused" },
  { panel: "studio-fresh-still", taps: SHAPE, label: "shape" },
  { panel: "studio-fresh-still", taps: RECORD, label: "record" },
  { panel: "hs-soundbites-full", taps: SOUNDBITES, label: "not today, full" },
  { panel: "hs-take-library", taps: LIBRARY, label: "takes on home" },
  { panel: "hs-ideas-lists", taps: LISTS, label: "home's lists" },
])
