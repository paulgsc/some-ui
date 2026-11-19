import type { JSX } from "react"
import { useEffect } from "react"
import { scenarioName } from "@some-ui/game-week"
import type { Compartment, LibraryTake, TakeNames } from "@some-ui/soundbites"
import {
  isCompartment,
  keptIdeaStore,
  LIBRARY_WORDS,
  phoneProjectStore,
  phoneSoundbiteKeeping,
  STUDIO_WORDS,
  TakeLibrary,
} from "@some-ui/soundbites"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

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
 * scenario, by the catalog the phone plays. A game is named by home's read,
 * or else the day it was played; an interview question by its id.
 */
const NAMES: TakeNames = {
  game: () => null,
  scenario: scenarioName,
  question: () => null,
}

/** Takes' ports, in the Android app alone (`build.paths.ts`). */
const PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { ...takePorts(STORES), names: NAMES }
    : null

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

/**
 * One compartment of Studio's Takes (TAKES3, #3069): its takes as cards,
 * each saying what it was said for (TAKES2, #3068), under chips for where
 * each is, its station, what it is about and how it stands, each with its
 * count, in the order picked (#3219). `?about=` (as home keys it,
 * `game:<id>`, with `?name=` for its chip) opens it filtered to one topic (a
 * game, a week): a wing's own view of its takes is this
 * page, as Game day's way to a game's takes is. Phone-only
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
  return (
    <StudioPage heading={LIBRARY_WORDS.compartmentHeading(kind)} back="takes">
      {PORTS !== null && (
        <TakeLibrary
          key={`${kind}:${about ?? ""}`}
          ports={PORTS}
          pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
          compartment={kind}
          row={toEpisode}
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
