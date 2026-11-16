import type { JSX } from "react"
import type { Compartment, LibraryTake } from "@some-ui/soundbites"
import {
  isCompartment,
  LIBRARY_WORDS,
  STUDIO_WORDS,
  TakeLibrary,
} from "@some-ui/soundbites"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { noteOfTake } from "@/lib/take-about"
import { takePorts } from "@/lib/take-library/ports"
import { PairHomeLink } from "@/components/pair-home-link"
import { StudioPage } from "@/components/studio/layout"

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
 * each is and its station, each with its count. Phone-only
 * (`build.paths.ts`).
 */
const KindPage = (): JSX.Element => {
  const { kind }: { kind: Compartment } = Route.useParams()
  return (
    <StudioPage heading={LIBRARY_WORDS.compartmentHeading(kind)} back="takes">
      {takePorts !== null && (
        <TakeLibrary
          key={kind}
          ports={takePorts}
          pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
          compartment={kind}
          row={toEpisode}
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
  component: KindPage,
})
