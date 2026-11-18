/** @vitest-environment node */
import type { TakeAbout } from "@soundbites/lib/library/compartments"
import { COMPARTMENTS, TAKE_KINDS } from "@soundbites/lib/library/compartments"
import { ABOUT_PORTS, NO_NAMES } from "@soundbites/lib/library/kinds"
import type { LibraryBy } from "@soundbites/lib/library/model"
import { ABOUT_WORDS, LIBRARY_WORDS } from "@soundbites/lib/library/words"
import { describe, expect, it } from "vitest"

/**
 * What the person must never be told in: how it works, not what it does
 * (CLAUDE.md, "State in the person's terms"), with the machinery behind a
 * search of home's words.
 */
const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|https?|token|queue|retry|null|undefined|database|store|blob|ref|id|query|index\w*|transcri\w*|embedding\w*|vector\w*|library|404|422|q)\b/i

/** Other words for a recording: "take" is the one (ST34). */
const OTHER_WORDS = /\b(recordings?|answers?|bites?|notes?|clips?)\b/i

const BY: ReadonlyArray<LibraryBy> = ["newest", "words", "meaning"]
const AT = "2026-11-03T09:00:00.000Z"

/** What a take can be said for: what the phone knows of it, and less. */
const ABOUTS: ReadonlyArray<TakeAbout> = [
  {
    kind: "note",
    feed: "The weekly call",
    episode: "Week of Nov 6",
    atMs: 192_000,
    picks: ["Pacing", "The voice"],
  },
  { kind: "scene", video: "The Rust Rounds essay", scene: 3 },
  { kind: "scene", video: null, scene: null },
  { kind: "idea", idea: "Typing rounds", question: "What's the video?" },
  { kind: "idea", idea: null, question: null },
  { kind: "ask", ask: "Should a canned take show?", number: 2876 },
  { kind: "ask", ask: null, number: 2876 },
  { kind: "ask", ask: null, number: null },
  { kind: "here" },
  // TAKES20: every other kind, as its port says it from what home was told.
  ABOUT_PORTS.game(
    {
      ref: "401772",
      fields: {
        strip: "Q3 8:42 · SF 17, SEA 13",
        scenario: "fourth-down",
        started: AT,
      },
    },
    NO_NAMES,
    ABOUT_WORDS
  ),
  ABOUT_PORTS.interview({ ref: "2026-w47:read:intro" }, NO_NAMES, ABOUT_WORDS),
  ABOUT_PORTS.soundbite({ ref: "direct" }, NO_NAMES, ABOUT_WORDS),
  ABOUT_PORTS.soundbite({ ref: "lesson" }, NO_NAMES, ABOUT_WORDS),
  ABOUT_PORTS.scene({ ref: "next-scene" }, NO_NAMES, ABOUT_WORDS),
]

/** Every word the table says: each fixed one, and each a maker makes. */
function everyWord(): Array<string> {
  const {
    shown,
    setAside,
    phoneFull,
    kinds,
    compartmentHeading,
    counted: countedFrom,
    empty,
    subject,
    detail,
    said,
    place,
    onHomeSince,
    openEpisode,
    status,
    order,
    ...fixed
  } = LIBRARY_WORDS
  const counts: ReadonlyArray<[number, number, number | null]> = [
    [0, 0, null],
    [1, 1, null],
    [50, 120, null],
    [0, 120, 0],
    [1, 120, 1],
    [3, 120, 3],
    [50, 120, 80],
  ]
  return [
    ...Object.values(fixed),
    ...Object.values(status),
    ...Object.values(order),
    ABOUT_WORDS.week(47),
    ABOUT_WORDS.read,
    ABOUT_WORDS.gameOn("Nov 16"),
    ABOUT_WORDS.aGame,
    ...TAKE_KINDS.flatMap((kind) => Object.values(kinds[kind])),
    ...COMPARTMENTS.flatMap((each) => [compartmentHeading(each), empty(each)]),
    countedFrom(50, 120),
    ...ABOUTS.flatMap((about) => [subject(about), detail(about)]).filter(
      (text) => text !== null
    ),
    said(AT),
    ...Object.values(place),
    onHomeSince(AT),
    openEpisode(192_000),
    ...BY.flatMap((by) =>
      counts.flatMap(([listed, total, matched]) => [
        shown(by, "brand intro", listed, total, matched),
        shown(by, null, listed, total, matched),
      ])
    ),
    setAside(AT),
    phoneFull(1),
    phoneFull(40),
  ]
}

describe("Takes on home's words (ST32)", () => {
  const all = everyWord()

  it("never name the machinery", () => {
    expect(all.filter((text) => MACHINERY.test(text))).toEqual([])
  })

  it("call a recording a take, and nothing else (ST34)", () => {
    expect(all.filter((text) => OTHER_WORDS.test(text))).toEqual([])
  })

  it("say which search ran: a search by words never claims meaning", () => {
    const byWords = LIBRARY_WORDS.shown("words", "brand", 3, 120, 3)
    expect(byWords).toBe("3 takes whose words hold “brand”, newest first.")
    expect(byWords).not.toMatch(/meaning/)
    expect(LIBRARY_WORDS.shown("words", "brand", 50, 120, 80)).toBe(
      "The newest 50 of 80 takes whose words hold “brand”."
    )
    expect(LIBRARY_WORDS.shown("words", "brand", 0, 120, 0)).toBe(
      "No take's words hold “brand”."
    )
    expect(LIBRARY_WORDS.shown("meaning", "brand", 3, 120, 3)).toMatch(
      /meaning/
    )
  })

  it("say what the phone holds that home doesn't have yet when it has no room (ST32)", () => {
    expect(LIBRARY_WORDS.phoneFull(40)).toBe(
      "This phone holds 40 takes home doesn't have yet. Once home has some, there's room for another."
    )
  })

  it("say what each kind of take was said for, from what the phone knows (TAKES2)", () => {
    const [note, scene, , idea, , ask, askBare] = ABOUTS
    expect(LIBRARY_WORDS.subject(note!)).toBe("The weekly call · Week of Nov 6")
    expect(LIBRARY_WORDS.detail(note!)).toBe("At 3:12")
    expect(LIBRARY_WORDS.subject(scene!)).toBe("The Rust Rounds essay")
    expect(LIBRARY_WORDS.detail(scene!)).toBe("Scene 3")
    expect(LIBRARY_WORDS.subject(idea!)).toBe("What's the video?")
    expect(LIBRARY_WORDS.detail(idea!)).toBe("About “Typing rounds”")
    expect(LIBRARY_WORDS.subject(ask!)).toBe("Should a canned take show?")
    expect(LIBRARY_WORDS.subject(askBare!)).toBe("The ask #2876")
    expect(LIBRARY_WORDS.subject({ kind: "here" })).toBeNull()
  })

  it("say what every other kind is about, through its port (TAKES20)", () => {
    const bite = ABOUTS.find((about) => about.kind === "bite")!
    expect(LIBRARY_WORDS.subject(bite)).toMatch(/^A game on /)
    expect(LIBRARY_WORDS.detail(bite)).toBe("Q3 8:42")
    const read = ABOUTS.find((about) => about.kind === "interview")!
    expect(LIBRARY_WORDS.subject(read)).toBe("Week 47")
    expect(LIBRARY_WORDS.detail(read)).toBe("Read aloud · intro")
  })

  it("say how many home keeps, and that the newest come first", () => {
    expect(LIBRARY_WORDS.shown("newest", null, 1, 1, null)).toBe(
      "The 1 take home keeps, newest first."
    )
    expect(LIBRARY_WORDS.shown("newest", null, 50, 120, null)).toBe(
      "The newest 50 of the 120 takes home keeps."
    )
  })
})
