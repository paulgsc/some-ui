/**
 * Studio's wing on the phone page, for `../stays-put-soundbites.spec.ts`
 * (HS1), beside the Studio and New idea fixtures `./fixtures.tsx` mounts:
 * "Not today?" on a full phone, takes on home, and home's lists.
 */
import type { JSX, ReactNode } from "react"
import { useState } from "react"
import type {
  IdeasHome,
  LibraryPage,
  SoundbitesProps,
  TakesHome,
} from "@some-ui/soundbites"
import {
  IdeasOnHome,
  Soundbites,
  soundbitesHeldByHome,
  TakeLibrary,
} from "@some-ui/soundbites"
import { bite, memorySoundbiteStore } from "@some-ui/soundbites/fixtures"
import { microphoneOwner } from "@some-ui/voice-capture"
import {
  simulatedMicrophone,
  simulatedPlayer,
  SPEAKING,
} from "@some-ui/voice-capture/testing"

/**
 * The route's column (`mx-auto w-full max-w-md`), inline: this directory is
 * outside www's Tailwind sources.
 */
const Column = ({ children }: { children: ReactNode }): JSX.Element => (
  <div style={{ width: "100%", maxWidth: 448, marginInline: "auto" }}>
    {children}
  </div>
)

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
    startRecording: simulatedMicrophone({
      now: Date.now,
      fallback: { ...SPEAKING, durationMs: 4_000 },
    }).startRecording,
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
