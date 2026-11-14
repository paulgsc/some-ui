import type { JSX } from "react"
import { STUDIO_WORDS, TakeLibrary } from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"
import { createFileRoute, Link } from "@tanstack/react-router"

import { libraryTakes } from "@/lib/library-takes"
import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { libraryStations } from "@/lib/take-conveyor"
import { takesHome } from "@/lib/take-library"
import { PairHomeLink } from "@/components/pair-home-link"
import { StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.takes

/**
 * Takes on home (ST32), with the phone's own takes with no scene to record
 * there, in the Android app alone, so no other build carries the link
 * (`build.paths.ts`).
 */
const TAKE_PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? {
        home: takesHome,
        player: audioPlayer,
        phone: libraryTakes(),
        stations: libraryStations(),
      }
    : null

/**
 * Studio's Takes (SFEED1, #2731): every take home keeps and this phone's
 * own (ST32's library), each playing in its row, with where each stands on
 * the conveyor; the way to the conveyor page (CONVEYOR2), where takes are
 * moved; and the way to What Studio keeps (MD4), where one can be let go in
 * My data.
 */
const Takes = (): JSX.Element => (
  <StudioPage heading={KIND_WORDS.takes.name} back="index">
    {TAKE_PORTS !== null && (
      <TakeLibrary
        ports={TAKE_PORTS}
        pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
      />
    )}
    <Link to="/journal/takes/conveyor" className={TILE}>
      <TileBody title={WORDS.conveyor} line={WORDS.conveyorLine} />
    </Link>
    <Link to="/journal/takes/kept" className={TILE}>
      <TileBody title={STUDIO_WORDS.records.open} line={WORDS.keptLine} />
    </Link>
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/takes/")({
  component: Takes,
})
