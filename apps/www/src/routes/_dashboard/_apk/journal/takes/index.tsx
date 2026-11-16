import type { JSX, ReactNode } from "react"
import type { Compartment } from "@some-ui/soundbites"
import {
  AttentionWayIn,
  keptIdeaStore,
  phoneProjectStore,
  STUDIO_WORDS,
  TakeLibrary,
} from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import type { AboutStores } from "@/lib/take-about"
import { takePorts } from "@/lib/take-library/ports"
import { reconcilePorts } from "@/lib/take-reconcile/ports"
import { PairHomeLink } from "@/components/pair-home-link"
import { StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.takes

/** This phone's ideas and videos, for what each take was said for. */
const STORES: AboutStores = {
  ideas: () => keptIdeaStore().list() ?? [],
  videos: () => phoneProjectStore().list(),
}

/** Takes' ports, in the Android app alone (`build.paths.ts`). */
const PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? takePorts(STORES) : null

/** The takes needing attention's ports, likewise (HEARD3). */
const ATTENTION =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? reconcilePorts() : null

/** The way in to the takes needing attention: its tile (HEARD3). */
const attentionTile = (body: ReactNode): JSX.Element => (
  <Link to="/journal/takes/attention" className={TILE}>
    {body}
  </Link>
)

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
 * can be let go in My data. Above them, while home lists any, the way to
 * the takes it couldn't hear well (HEARD3, `./attention`). The tiles are
 * the Android app's alone, so no other build carries the link
 * (`build.paths.ts`).
 */
const Takes = (): JSX.Element => (
  <StudioPage heading={KIND_WORDS.takes.name} back="index">
    {ATTENTION !== null && (
      <AttentionWayIn ports={ATTENTION} wayIn={attentionTile} />
    )}
    {PORTS !== null && (
      <TakeLibrary
        ports={PORTS}
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
