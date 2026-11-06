/**
 * Studio's wing on the phone page, for `../stays-put-soundbites.spec.ts`
 * (HS1): Studio and New idea as `./fixtures.tsx` mounts them, on a
 * microphone that hears four seconds and does not meter its level.
 *
 * Unmetered because the take button breathes with a metered level
 * (`transform: scale`, `@some-ui/shared`'s take button): a transform about
 * the button's own centre, which moves no other box and keeps the thumb's
 * point inside it, but which the measure reads as a box that changed. These
 * walks measure the flow; the breath is the shared button's to settle.
 */
import type { JSX, ReactNode } from "react"
import { useState } from "react"
import { inMemoryStorage } from "@some-ui/core-utils"
import type {
  IdeasHome,
  LibraryPage,
  Project,
  SoundbitesProps,
  StudioProps,
  TakesHome,
  WingLink,
} from "@some-ui/soundbites"
import {
  IdeasOnHome,
  keptDraftStore,
  keptIdeaStore,
  keptLetGo,
  keptTimeLog,
  NewIdeaPage,
  Soundbites,
  soundbitesHeldByHome,
  STUDIO_WORDS,
  StudioHome,
  TakeLibrary,
} from "@some-ui/soundbites"
import {
  bite,
  bundleTakesOf,
  memoryProjectStore,
  memorySoundbiteStore,
  primerOf,
  projectFromPrimer,
} from "@some-ui/soundbites/fixtures"
import type { TurnListener } from "@some-ui/voice-capture"
import { microphoneOwner, ONE_TAKE } from "@some-ui/voice-capture"
import type { MicScript } from "@some-ui/voice-capture/testing"
import {
  simulatedMicrophone,
  simulatedPattern,
  simulatedPlayer,
  SPEAKING,
} from "@some-ui/voice-capture/testing"

import { FIT_PRIMER_TEXT } from "./studio-seed"

const AT = "2026-10-30T09:00:00.000Z"

/** Hears four seconds, its level unmetered: the take button holds its size. */
const HEARS: MicScript = {
  ...SPEAKING,
  level: 0,
  metered: false,
  durationMs: 4_000,
}

const noop = (): void => undefined

/** A recognizer that is there and never finishes, so each screen offers to listen. */
const listener: TurnListener = {
  available: () => Promise.resolve(true),
  listen: () => ({
    done: new Promise(() => undefined),
    stop: noop,
    cancel: noop,
  }),
}

/** `storage`, the same one on every look. */
const once =
  (storage: Storage): (() => Storage) =>
  () =>
    storage

const anchorTo = (href: string): WingLink => {
  const Anchor: WingLink = ({ className, children }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
  return Anchor
}

/** The wing's Home on `projects`, in memory. */
function studioOn(projects: ReadonlyArray<Project>): () => JSX.Element {
  const ports: NonNullable<StudioProps["ports"]> = {
    store: memoryProjectStore(projects).store,
    startRecording: simulatedMicrophone({ now: Date.now, fallback: HEARS })
      .startRecording,
    timeLog: keptTimeLog(inMemoryStorage),
    letGo: keptLetGo(once(inMemoryStorage())),
    listener,
    // A clock that holds still, so a take under way neither fills the take
    // button (an animation each tick, which no measure can wait out) nor
    // reaches its cap and stops itself between two taps.
    now: () => Date.parse(AT),
  }
  const StudioFixture = (): JSX.Element => (
    <StudioHome
      ports={ports}
      ideaLink={anchorTo("#idea")}
      ideasLink={anchorTo("#ideas")}
    />
  )
  return StudioFixture
}

/** New idea; `refuse`: the microphone refuses the first take. */
function newIdea(refuse: boolean): () => JSX.Element {
  const simulated = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  })
  const refused: MicScript = {
    ...HEARS,
    open: { kind: "refuse", reason: "denied", ms: 0 },
  }
  simulated.mic.script(...(refuse ? [refused] : []), HEARS, HEARS, HEARS)
  const storage = once(inMemoryStorage())
  const takes = bundleTakesOf(simulated)
  const ports = {
    drafts: keptDraftStore(storage),
    ideas: keptIdeaStore(storage),
  }
  const IdeaFixture = (): JSX.Element => (
    <NewIdeaPage
      takes={takes}
      ports={ports}
      backLink={anchorTo("#studio")}
      pair={<a href="#pair">{STUDIO_WORDS.pair.pair}</a>}
    />
  )
  return IdeaFixture
}

/**
 * The route's column (`mx-auto w-full max-w-md`), inline: this directory is
 * outside www's Tailwind sources.
 */
const Column = ({ children }: { children: ReactNode }): JSX.Element => (
  <div style={{ width: "100%", maxWidth: 448, marginInline: "auto" }}>
    {children}
  </div>
)

const FRESH = projectFromPrimer(
  "hs-fresh",
  primerOf(FIT_PRIMER_TEXT),
  AT
).project

/**
 * "Not today?" with the phone full: six kept, every one held by home, so
 * each row offers to be replaced next. Setting one aside is refused, as a
 * phone with no room to write it would.
 */
function fullPhone(): NonNullable<SoundbitesProps["ports"]> {
  const holds = (): boolean => true
  soundbitesHeldByHome(() => holds)
  const { store } = memorySoundbiteStore(
    [1, 2, 3, 4, 5, 6].map((n) => bite(`bite-${n}`, n * 90))
  )
  return {
    store: {
      ...store,
      setAside: (): Promise<void> =>
        Promise.reject(new DOMException("full", "QuotaExceededError")),
    },
    startRecording: simulatedMicrophone({ now: Date.now, fallback: HEARS })
      .startRecording,
    player: simulatedPlayer(),
    owner: microphoneOwner(),
  }
}

const SoundbitesFull = (): JSX.Element => {
  // Made once, as the route's are: what home holds is said on mount.
  const [ports] = useState(fullPhone)
  return (
    <Soundbites
      situation={() => ({
        lastSessionAt: null,
        openSessions: 0,
        timeZone: "UTC",
      })}
      ports={ports}
    />
  )
}

/** Three takes home keeps, each said in words. */
const LIBRARY: LibraryPage = {
  takes: ["one", "two", "three"].map((n, i) => ({
    id: `take-${n}`,
    ref: `fit-video:shot-${n}:take-${n}`,
    recordedAt: `2026-10-2${i}T09:00:00.000Z`,
    storedAt: `2026-10-2${i}T09:05:00.000Z`,
    size: 40_000,
    setAsideAt: null,
    heard: {
      text: `Take ${n}: the path card, and every pick of the week on it.`,
      language: "en",
      model: "fit",
      heardAt: `2026-10-2${i}T09:10:00.000Z`,
    },
  })),
  total: 3,
  matched: null,
  by: "newest",
}

/**
 * Takes on home: the first take's audio never comes, so it stays loading;
 * the second's comes back empty, so it can't be played.
 */
const TAKES_HOME: TakesHome = {
  takes: () => Promise.resolve({ kind: "read", page: LIBRARY }),
  audio: (id) =>
    id === "take-one" ? new Promise(() => undefined) : Promise.resolve(null),
}

const Library = (): JSX.Element => {
  const [ports] = useState(() => ({
    home: TAKES_HOME,
    player: simulatedPlayer(),
  }))
  return (
    <Column>
      <TakeLibrary ports={ports} pair={<a href="#pair">Pair</a>} />
    </Column>
  )
}

/** Home's lists of subjects and keywords, which it keeps as they are. */
const IDEAS_HOME: IdeasHome = {
  ideas: () =>
    Promise.resolve({ kind: "read", value: { ideas: [], more: false } }),
  lists: () =>
    Promise.resolve({
      kind: "read",
      value: {
        topics: ["Studio", "LeetType", "Korean"],
        keywords: ["home", "voice", "phone"],
      },
    }),
  furnish: (_id, furnishing) =>
    Promise.resolve({ kind: "written", value: furnishing }),
  setAside: () => Promise.resolve({ kind: "written", value: null }),
  entry: () =>
    Promise.resolve({
      kind: "written",
      value: {
        topics: ["Studio", "LeetType", "Korean"],
        keywords: ["home", "voice", "phone"],
      },
    }),
}

export const SOUNDBITES_FIXTURES = {
  "hs-studio-fresh": studioOn([FRESH]),
  "hs-idea": newIdea(false),
  "hs-idea-refused": newIdea(true),
  "hs-soundbites-full": SoundbitesFull,
  "hs-take-library": Library,
  "hs-ideas-lists": (): JSX.Element => (
    <Column>
      <IdeasOnHome
        home={IDEAS_HOME}
        initialLists
        pair={<a href="#pair">Pair</a>}
      />
    </Column>
  ),
} satisfies Record<string, () => JSX.Element>
