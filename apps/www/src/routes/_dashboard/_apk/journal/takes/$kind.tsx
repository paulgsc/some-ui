import type { JSX } from "react"
import { useEffect } from "react"
import {
  halfName,
  MissedMoment,
  momentsWithNoBite,
  readMoments,
  scenarioName,
  unitName,
} from "@some-ui/game-week"
import type { GameMoment } from "@some-ui/game-week"
import type {
  Compartment,
  LibraryTake,
  TakeNames,
  TopicGap,
} from "@some-ui/soundbites"
import {
  isCompartment,
  keptIdeaStore,
  LIBRARY_WORDS,
  phoneProjectStore,
  phoneSoundbiteKeeping,
  STUDIO_WORDS,
  TakeLibrary,
} from "@some-ui/soundbites"
import { queryOptions, skipToken, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import type { MomentsQueryOptions } from "@/lib/game-moments"
import { gameMomentsQuery } from "@/lib/game-moments"
import { keepSoundbites } from "@/lib/soundbite-keeping"
import { noteOfTake } from "@/lib/take-about"
import type { AboutStores } from "@/lib/take-about"
import { takePorts } from "@/lib/take-library/ports"
import { PairHomeLink } from "@/components/pair-home-link"
import { StudioPage } from "@/components/studio/layout"

/** This phone's ideas and videos, for what each take was said for. */
const STORES: AboutStores = {
  ideas: () => keptIdeaStore().list() ?? [],
  videos: () => phoneProjectStore().list(),
}

/**
 * What this phone can name that a take's ref only points at: a game bite's
 * scenario, unit and half, by the catalog the phone plays. A game is named by home's read,
 * or else the day it was played; an interview question by its id.
 */
const NAMES: TakeNames = {
  game: () => null,
  scenario: scenarioName,
  question: () => null,
  unit: unitName,
  half: halfName,
}

/** Takes' ports, in the Android app alone (`build.paths.ts`). */
const PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { ...takePorts(STORES), names: NAMES }
    : null

/**
 * A game's moment log, read through the home link: the Android app's alone,
 * behind the same inline flag as the ports, so other builds drop the link.
 */
const MOMENTS: ((gameId: string) => MomentsQueryOptions) | null =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? (gameId): MomentsQueryOptions => gameMomentsQuery(gameId, readMoments)
    : null

const NO_GAME: readonly ["home", "game-moments", string] = [
  "home",
  "game-moments",
  "",
]

/** No game's log: what the page asks while none is read. */
const NO_MOMENTS: MomentsQueryOptions = queryOptions({
  queryKey: NO_GAME,
  queryFn: skipToken,
})

/**
 * Under a note's take, the way to its episode at the moment the note was
 * left (TAKES2).
 */
const toEpisode = (take: LibraryTake): JSX.Element | null => {
  const note = noteOfTake(take.id)
  if (note === null) return null
  return (
    <Link
      to="/journal/episodes/$feed/$key"
      params={{ feed: note.feed, key: note.episode }}
      search={{ at: note.atMs }}
      className="text-brand self-start text-sm font-semibold underline-offset-4 hover:underline"
    >
      {LIBRARY_WORDS.openEpisode(note.atMs)}
    </Link>
  )
}

const GAME_TOPIC = "game:"

/** The game a topic is, as home keys it (`game:<id>`); null for another topic. */
const gameOf = (about: string | undefined): string | null =>
  about?.startsWith(GAME_TOPIC) === true && about.length > GAME_TOPIC.length
    ? about.slice(GAME_TOPIC.length)
    : null

/**
 * The game's big moments no bite was said about, as rows among its bites
 * (GWB14 D15): a bite home matched to a play covers every moment of it.
 */
function missedOf(
  moments: ReadonlyArray<GameMoment>,
  takes: ReadonlyArray<LibraryTake>
): ReadonlyArray<TopicGap> {
  const saidOn = new Set(
    takes.flatMap(({ fields }) =>
      fields?.playId === undefined ? [] : [fields.playId]
    )
  )
  return momentsWithNoBite(moments, saidOn).map((moment) => ({
    key: `${moment.playId}:${moment.scenario}`,
    at: moment.at,
    body: <MissedMoment moment={moment} />,
  }))
}

/**
 * One compartment of Studio's Takes (TAKES3, #3069): its takes as cards,
 * each saying what it was said for (TAKES2, #3068), under chips for where
 * each is, its station, what it is about and how it stands, each with its
 * count, in the order picked (#3219). `?about=` (as home keys it,
 * `game:<id>`, with `?name=` for its chip) opens it filtered to one topic (a
 * game, a week): a wing's own view of its takes is this
 * page, as Game day's way to a game's takes is. Opened on a game, its big
 * moments no bite was said about show dimmed among its bites (GWB14 D15),
 * while it is on and once it is over. Phone-only
 * (`build.paths.ts`).
 */
const KindPage = (): JSX.Element => {
  const { kind }: { kind: Compartment } = Route.useParams()
  const { about, name }: { about?: string; name?: string } = Route.useSearch()
  // Soundbites not on home yet are among the takes: their store, which the
  // soundbites' own page may not have handed in yet in this run.
  useEffect(() => {
    if (PORTS !== null) keepSoundbites(phoneSoundbiteKeeping())
  }, [])
  // Opened on one game: its moment log, for the big moments with no bite.
  // Only where bites are listed: elsewhere every moment would read as missed.
  const game =
    MOMENTS === null || (kind !== "bite" && kind !== "all")
      ? null
      : gameOf(about)
  const moments = useQuery(
    MOMENTS === null || game === null ? NO_MOMENTS : MOMENTS(game)
  )
  const log = moments.data?.kind === "read" ? moments.data.log : null
  return (
    <StudioPage heading={LIBRARY_WORDS.compartmentHeading(kind)} back="takes">
      {PORTS !== null && (
        <TakeLibrary
          key={`${kind}:${about ?? ""}`}
          ports={PORTS}
          pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
          compartment={kind}
          row={toEpisode}
          gaps={
            log === null
              ? undefined
              : (topic, takes): ReadonlyArray<TopicGap> =>
                  // Only the game the page opened on has its log read.
                  topic === about ? missedOf(log.moments, takes) : []
          }
          initialChips={
            about === undefined
              ? undefined
              : {
                  topic: {
                    key: about,
                    label: name ?? LIBRARY_WORDS.picked,
                    asks: true,
                  },
                }
          }
        />
      )}
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/takes/$kind")({
  params: {
    parse: ({ kind }): { kind: Compartment } => {
      if (!isCompartment(kind)) throw notFound()
      return { kind }
    },
    stringify: ({ kind }: { kind: Compartment }): { kind: string } => ({
      kind,
    }),
  },
  validateSearch: (
    search: Record<string, unknown>
  ): { about?: string; name?: string } => {
    const about =
      typeof search.about === "string" && search.about !== ""
        ? { about: search.about }
        : {}
    const name =
      typeof search.name === "string" && search.name !== ""
        ? { name: search.name }
        : {}
    return { ...about, ...name }
  },
  component: KindPage,
})
