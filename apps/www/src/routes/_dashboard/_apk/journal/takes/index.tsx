import type { JSX, ReactNode } from "react"
import type { Compartment } from "@some-ui/soundbites"
import { STUDIO_WORDS, TakeLibrary } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { takePorts } from "@/lib/take-library/ports"
import { PairHomeLink } from "@/components/pair-home-link"
import { StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.takes

/** A compartment's tile: the way to its page (`./$kind`). */
const kindTile = (compartment: Compartment, body: ReactNode): JSX.Element => (
  <Link
    to="/journal/takes/$kind"
    params={{ kind: compartment }}
    className={TILE}
  >
    {body}
  </Link>
)

/**
 * Studio's Takes (SFEED1, #2731; TAKES3, #3069): a tile per kind of take,
 * each with how many there are, and one for all of them, each opening that
 * compartment's list (`./$kind`); the way to the conveyor page (CONVEYOR2),
 * where takes are moved; and the way to What Studio keeps (MD4), where one
 * can be let go in My data. The tiles are the Android app's alone, so no
 * other build carries the link (`build.paths.ts`).
 */
const Takes = (): JSX.Element => (
  <StudioPage heading={KIND_WORDS.takes.name} back="index">
    {takePorts !== null && (
      <TakeLibrary
        ports={takePorts}
        pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
        compartment={null}
        tile={kindTile}
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
