/**
 * Promise HS1, for Studio's wing, `@some-ui/soundbites` (`./stays-put.spec.ts`
 * holds the claim).
 * - Family: every tap each walk below takes, at each of `PHONE_VIEWPORTS`
 *   (the phone held sideways among them); for New idea, a format, a title
 *   typed, a subject and a keyword picked and unpicked, a take started, kept
 *   and said again, the look-over's Play and Stop, and a take the microphone
 *   refused; for Studio's Shape, every plan tapped, each look and voice, below
 *   and above the one open; for Record, a take started, kept, recorded again
 *   and thrown away; for Watch, Claude's change asked and answered, whose
 *   idea a scene is asked, a note typed, noted, said and heard back, a
 *   scene's idea put right in words said and heard back, and on an episode, what a note is about; for Start,
 *   when takes leave the phone, chosen and changed; for Finish, home asked to
 *   make an episode; for "Not today?" on a full phone, the one replaced next
 *   picked twice, Play and Stop, and a set-aside refused; for takes on home,
 *   a Play still loading, a Play home can't give back, a search refused as
 *   too long and retyped; for home's lists, a subject typed past the longest
 *   and back; for the idea shelf, Claude's question said, its words fixed
 *   and typed, and Make held while the phone's videos are read again. A tap
 *   that declares `reflows` (another screen, another step) is outside it,
 *   and says why; one that declares `grows` holds what is at and above it.
 * - Proof: this spec, over `../layout-invariants/stays-put.ts`.
 * - Tolerance: a screen this spec does not walk, among them Start's version
 *   question after a pick, Done for now, and the idea shelf's list.
 */

import {
  button,
  picksFile,
  toScreen,
  waitsFor,
  type Tap,
} from "@tests/layout-invariants/stays-put"

import { walkEachPhone } from "./harness"
import { fitReviewText } from "./phone-page/studio-seed"

/** Waits for `name` to be offered, so the next tap starts from a still screen. */
const until = (name: string | RegExp, does: string): Tap =>
  waitsFor((page) => page.getByRole("button", { name }), does)

/**
 * Stops the take under way and waits for it to be kept. A take on a short
 * scene can reach its cap and stop itself first; then there is nothing to tap.
 * The first take kept grows its row below the button, which holds its place.
 */
const keep = (does: string, grows?: string): Tap => ({
  does,
  ...(grows === undefined ? {} : { grows }),
  target: (page) =>
    page
      .getByRole("button", { name: /^(Stop, and keep it|Record it again)$/ })
      .first(),
  act: async (page): Promise<void> => {
    const stop = page.getByRole("button", { name: "Stop, and keep it" })
    if (await stop.isVisible()) await stop.click({ timeout: 2_000 })
    await page.getByRole("button", { name: "Record it again" }).waitFor()
  },
})

/** Watch's render and the notes beside it, picked together as it asks. */
const pickReview = (rev: number, title?: string): Tap =>
  picksFile(
    [
      { name: "review.mp4", mimeType: "video/mp4", body: "v" },
      {
        name: "review.json",
        mimeType: "application/json",
        body: fitReviewText(rev, title),
      },
    ],
    "picks the render and its notes",
    {
      says: (page) => page.getByRole("button", { name: /^Note here/ }),
      reflows: "screen: the render, in place of the pick that opens it",
    }
  )

/** Types `text` as Watch's note. */
const note = (text: string): Tap => ({
  does: "types a note",
  act: (page) => page.getByLabel("Your note").fill(text),
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
  keep("keeps the answer's first take", "the answer's take, as its row"),
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
  keep("keeps the scene's first take", "the scene's take, as its row"),
  button("Record it again", "records it again"),
  button("Throw it away", "throws the new take away"),
  until("Record it again", "waits for the take to go"),
]

/**
 * Watch on a render of revision 2: Claude's change asked and answered, then
 * whose idea the scene is, asked over the screen while a note is typed,
 * noted, and said.
 */
const WATCH: ReadonlyArray<Tap> = [
  toScreen(/^Watch /, "opens Watch"),
  pickReview(2),
  until("Good", "waits for Claude's change to be asked"),
  button("Good", "says the change is good"),
  until("That's right", "waits for whose idea the scene is"),
  note("Hold the path card a beat longer."),
  button(/^Note here/, "notes it here"),
  button(/^Say a note/, "starts saying a note"),
  button("Done talking", "stops talking"),
  until(/^Note this at/, "waits for the note heard back"),
  button(/^Note this at/, "notes what was said"),
]

/** Watch, putting a scene's idea right: its words said, not typed. */
const WATCH_IDEA: ReadonlyArray<Tap> = [
  toScreen(/^Watch /, "opens Watch"),
  pickReview(2),
  until("Good", "waits for Claude's change to be asked"),
  button("Good", "says the change is good"),
  until("Not quite", "waits for whose idea the scene is"),
  {
    ...button("Not quite", "says the idea is not quite right"),
    reflows: "step: putting the scene's idea right, in place of the note",
  },
  until("In my take for this scene", "waits for where the words are"),
  button("Say where it came from", "starts saying where it came from"),
  button("Done talking", "stops talking"),
  until("Keep it as mine", "waits for the words heard back"),
  button("Say it again", "says it again"),
]

/** Watch on an episode: what a note is about, asked before it is kept. */
const WATCH_EPISODE: ReadonlyArray<Tap> = [
  toScreen(/^Watch /, "opens Watch"),
  pickReview(1, "Playoff Delta, 2026 week 8"),
  note("The ceiling line runs long for the phone; cut it to one line."),
  button(/^Note here/, "notes it here, asked what it is about"),
  button(/^My take/, "says it is about the take"),
]

/** Claude's reply to the shelf's idea, as a session sends it. */
const reply = (fields: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({
    schema: "some-ui.studio-idea-reply/1",
    idea: "fit-idea",
    ...fields,
  })

/** Scenes Claude made of the idea: it is ready to be a video. */
const SCENES = {
  version: 2,
  title: "Week 8 picks",
  cuts: [
    {
      id: "path",
      artifact: "The path card",
      point: "Following the model paid off",
      targetSec: 20,
      from: ["what", "spark"],
    },
    {
      id: "next",
      artifact: "End card",
      point: "What week 9 tests",
      targetSec: 10,
    },
  ],
}

/** Opens the shelf's one idea and picks Claude's reply to it. */
const OPEN_WITH_REPLY = (
  fields: Readonly<Record<string, unknown>>
): ReadonlyArray<Tap> => [
  until(/week 8/, "waits for the shelf"),
  toScreen(/week 8/, "opens the idea"),
  picksFile(
    { name: "reply.json", mimeType: "application/json", body: reply(fields) },
    "picks Claude's reply",
    {
      says: (page) => page.getByText("Claude's", { exact: false }),
      reflows: "step: the idea, moved on by Claude's reply",
    }
  ),
]

/** The shelf: Claude's question, said, fixed in words, and kept. */
const SHELF_ANSWER: ReadonlyArray<Tap> = [
  ...OPEN_WITH_REPLY({ primer: null, ask: ["Which week is it?"] }),
  toScreen(/^Answer Claude's question/, "opens Claude's question"),
  button("Say it", "starts saying the answer", { exact: true }),
  {
    ...button("Done talking", "stops talking"),
    grows: "the words heard, and what to do with them, below the controls",
  },
  {
    ...button("Fix the words", "fixes the words"),
    grows: "the words to fix, in place of the words heard",
  },
  {
    does: "types the words",
    act: (page) =>
      page.getByRole("textbox", { name: "Which week is it?" }).fill("Week 8."),
  },
]

/** The shelf, the phone's videos unread: Make held until they are read. */
const SHELF_UNREAD: ReadonlyArray<Tap> = [
  ...OPEN_WITH_REPLY({ primer: SCENES }),
  until("Try again", "waits for the videos unread"),
  button("Try again", "reads the phone's videos again"),
  until("Make this a video", "waits for Make"),
]

/** Start, home holding every take: when they leave, chosen and changed. */
const LET_GO: ReadonlyArray<Tap> = [
  until("Keep each until Drive has it too", "waits for the choice"),
  {
    ...button(
      "Keep each until Drive has it too",
      "keeps each until Drive has it"
    ),
    grows: "what the choice does, and each take waiting on Drive, below it",
  },
  {
    ...button("Let takes go once home has them", "lets them go once home has"),
    grows: "what the choice does, below the choices",
  },
]

/** Finish on an episode ready for YouTube: home asked to make it. */
const MADE_ON_HOME: ReadonlyArray<Tap> = [
  toScreen(/^Finish /, "opens Finish"),
  button("Have home make it", "asks home to make it"),
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
  { panel: "studio-reviewed", taps: WATCH, label: "watch" },
  { panel: "studio-reviewed", taps: WATCH_IDEA, label: "watch, an idea" },
  { panel: "studio-episode", taps: WATCH_EPISODE, label: "watch, episode" },
  { panel: "studio-held", taps: LET_GO, label: "when takes leave" },
  { panel: "studio-episode-ready", taps: MADE_ON_HOME, label: "made on home" },
  { panel: "hs-soundbites-full", taps: SOUNDBITES, label: "not today, full" },
  { panel: "hs-take-library", taps: LIBRARY, label: "takes on home" },
  { panel: "hs-ideas-lists", taps: LISTS, label: "home's lists" },
  { panel: "hs-idea-shelf", taps: SHELF_ANSWER, label: "idea shelf" },
  {
    panel: "hs-idea-shelf-unread",
    taps: SHELF_UNREAD,
    label: "idea shelf, videos unread",
  },
])
