/**
 * Studio's Takes in compartments (TAKES2 #3068, TAKES3 #3069) as the phone
 * draws it, for `../takes-fit.spec.ts`: the tiles, All with every kind and
 * the widest words a card says (a long episode, many picks, a long question,
 * long words heard), one kind's page, and a phone not paired. Fakes for
 * home, the conveyor and what each take was said for; plain anchors for
 * the tiles' links, since the page has no router.
 */
import type { JSX, ReactNode } from "react"
import type {
  Compartment,
  LibraryAbout,
  LibraryPhone,
  LibraryRead,
  LibraryStations,
  LibraryTake,
  TakeAbout,
  TakesHome,
} from "@some-ui/soundbites"
import { TakeLibrary } from "@some-ui/soundbites"
import type { PatternTake, Player } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern } from "@some-ui/voice-capture/testing"

import { CardAnchor } from "@/components/card-route"

const AT = "2026-11-14T09:00:00.000Z"

const take = (
  id: string,
  ref: string,
  heard: string | null,
  over: Partial<LibraryTake> = {}
): LibraryTake => ({
  id,
  ref,
  recordedAt: AT,
  storedAt: AT,
  size: 48_000,
  setAsideAt: null,
  heard:
    heard === null
      ? null
      : { text: heard, language: "en", model: "base", heardAt: AT },
  // Home hears any take again on the owner's ask (#3339): the ask shows,
  // and a take asked of lately says when it can be asked again.
  hearAgain:
    id === "n2"
      ? { askAgainAt: "2026-11-21T15:00:00.000Z", hearing: false }
      : { askAgainAt: null, hearing: false },
  ...over,
})

const LONG =
  "The middle drags when it reads every pull request out loud, one after another; say the three that moved and let the rest be a list on screen, so the week reads in a minute"

const TAKES: ReadonlyArray<LibraryTake> = [
  take("n1", "take:n1", LONG),
  take("n2", "take:n2", "The seed line runs off the right edge."),
  take("s1", "rust-essay-w45:scene-3:take-2", "Ownership moves here."),
  take("i1", "idea:i1:takeaway", null),
  take("a1", "ask:some-ui-2876", "Yes, but folded under the list."),
  take("r1", "take:r1", "An aside about the stations' names", {
    setAsideAt: AT,
  }),
  take("r2", "take:r2", ""),
]

const ABOUT: Readonly<Record<string, TakeAbout>> = {
  n1: {
    kind: "note",
    feed: "The weekly call",
    episode: "2026-11-06 to 2026-11-12",
    atMs: 3_725_000,
    picks: [
      "Missed my intuition",
      "Wrong or unsupported",
      "Things overlap",
      "Music too loud",
      "Pacing",
    ],
  },
  n2: {
    kind: "note",
    feed: "Playoff Delta",
    episode: "2026, week 10",
    atMs: 48_000,
    picks: ["Text clipped"],
  },
  s1: {
    kind: "scene",
    video: "The Rust Rounds essay, 2026, week 45",
    scene: 3,
  },
  i1: {
    kind: "idea",
    idea: "What a typing round should remember between days, and for how long",
    question: null,
  },
  a1: {
    kind: "ask",
    ask: "Should a canned take still show in Takes, folded under the list, or only under All?",
    number: 2876,
  },
}

const STATION: ReadonlyMap<string, string> = new Map([
  ["n1", "Ready for pickup"],
  ["n2", "Picked up"],
  ["s1", "Cooking"],
  ["a1", "In the oven"],
  ["r1", "Canned"],
  ["r2", "In the oven"],
])

const NAMES = [
  "In the oven",
  "Cooking",
  "Ready for pickup",
  "Picked up",
  "Canned",
]

const nothingChanges = (): (() => void) => () => undefined

const about: LibraryAbout = {
  subscribe: nothingChanges,
  getSnapshot: () => 0,
  about: (id) => ABOUT[id] ?? null,
}

const stations: LibraryStations = {
  subscribe: nothingChanges,
  getSnapshot: () => 0,
  standing: (each) => {
    const name = STATION.get(each.id)
    return name === undefined ? null : `${name} since Nov 14`
  },
  names: NAMES,
  station: (each) => {
    const name = STATION.get(each.id)
    return name === undefined ? null : { name, canned: name === "Canned" }
  },
}

const read = (answer: LibraryRead): TakesHome => ({
  takes: (): Promise<LibraryRead> => Promise.resolve(answer),
  audio: (): Promise<Blob | null> => Promise.resolve(null),
  hearAgain: () => Promise.resolve({ kind: "notTaken" }),
})

const LISTED: LibraryRead = {
  kind: "read",
  page: { takes: TAKES, total: 120, matched: null, by: "newest" },
}

const player: Player = {
  play: () => ({
    ended: new Promise<void>(() => undefined),
    stop: () => undefined,
  }),
}

/** A take recorded here that home doesn't have yet. */
const ON_PHONE: ReadonlyArray<PatternTake> = [
  {
    id: "p1",
    answers: "library",
    durationMs: 52_000,
    recordedAt: AT,
    standing: "current",
    kept: { place: "going" },
  },
]

const sim = simulatedPattern({
  options: { ...ONE_TAKE, takes: { per: "many", max: 40, full: "make-room" } },
  seed: ON_PHONE,
})

const PHONE_SNAPSHOT = { takes: ON_PHONE, full: false }

const phone: LibraryPhone = {
  pattern: sim.pattern,
  line: "library",
  getSnapshot: () => PHONE_SNAPSHOT,
  subscribe: nothingChanges,
}

const tile = (compartment: Compartment, body: ReactNode): JSX.Element => (
  <CardAnchor href={`#${compartment}`}>{body}</CardAnchor>
)

const shown = (
  compartment: Compartment | null,
  answer: LibraryRead = LISTED
): (() => JSX.Element) => {
  const ports = { home: read(answer), player, phone, stations, about }
  const Shown = (): JSX.Element => (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Takes</h1>
      <TakeLibrary
        ports={ports}
        pair={<a href="/settings">Pair with home</a>}
        compartment={compartment}
        tile={tile}
      />
    </div>
  )
  return Shown
}

export const TAKES_FIXTURES = {
  "takes-tiles": shown(null),
  "takes-all": shown("all"),
  "takes-note": shown("note"),
  "takes-unpaired": shown("here", { kind: "unpaired" }),
} satisfies Record<string, () => JSX.Element>

export type TakesId = keyof typeof TAKES_FIXTURES
