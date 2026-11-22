import type { JSX, ReactNode } from "react"
import { useEffect } from "react"
import type { Compartment } from "@some-ui/soundbites"
import {
  AttentionWayIn,
  keptIdeaStore,
  phoneProjectStore,
  phoneSoundbiteKeeping,
  STUDIO_WORDS,
  TakeLibrary,
} from "@some-ui/soundbites"
import { createFileRoute } from "@tanstack/react-router"

import { keepSoundbites } from "@/lib/soundbite-keeping"
import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import type { AboutStores } from "@/lib/take-about"
import { takePorts } from "@/lib/take-library/ports"
import { reconcilePorts } from "@/lib/take-reconcile/ports"
import { CardRoute } from "@/components/card-route"
import { PairHomeLink } from "@/components/pair-home-link"
import { StudioPage, TileBody } from "@/components/studio/layout"

/** The page's ports, in the Android app alone (`build.paths.ts`). */
const ATTENTION =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? reconcilePorts() : null

const WORDS = STUDIO_INDEX_WORDS.takes

/** This phone's ideas and videos, for what each take was said for. */
const STORES: AboutStores = {
  ideas: () => keptIdeaStore().list() ?? [],
  videos: () => phoneProjectStore().list(),
}

/** Takes' ports, in the Android app alone (`build.paths.ts`). */
const PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? takePorts(STORES) : null

const attentionTile = (body: ReactNode): JSX.Element => (
  <CardRoute to="/journal/takes/attention">{body}</CardRoute>
)

/** A compartment's tile: the way to its page (`./$kind`). */
const kindTile = (compartment: Compartment, body: ReactNode): JSX.Element => (
  <CardRoute to="/journal/takes/$kind" params={{ kind: compartment }}>
    {body}
  </CardRoute>
)

/**
 * Studio's Takes (SFEED1, #2731; TAKES3, #3069): a tile per kind of take,
 * each with how many there are, and one for all of them, each opening that
 * compartment's list (`./$kind`); the way to the conveyor page (CONVEYOR2),
 * where takes are moved; and the way to What Studio keeps (MD4), where one
 * can be let go in My data; and, while home lists any, the way to the
 * takes it couldn't hear well (HEARD3, `./attention`). The tiles are
 * the Android app's alone, so no other build carries the link
 * (`build.paths.ts`).
 */
const Takes = (): JSX.Element => {
  // Soundbites not on home yet are among the takes: their store, which the
  // soundbites' own page may not have handed in yet in this run.
  useEffect(() => {
    if (PORTS !== null) keepSoundbites(phoneSoundbiteKeeping())
  }, [])
  return (
    <StudioPage heading={KIND_WORDS.takes.name} back="index">
      {PORTS !== null && (
        <TakeLibrary
          ports={PORTS}
          pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
          compartment={null}
          tile={kindTile}
        />
      )}
      <CardRoute to="/journal/takes/conveyor">
        <TileBody title={WORDS.conveyor} line={WORDS.conveyorLine} />
      </CardRoute>
      <CardRoute to="/journal/takes/kept">
        <TileBody title={STUDIO_WORDS.records.open} line={WORDS.keptLine} />
      </CardRoute>
      {/* Last, so nothing above moves when it appears (HS1). */}
      {ATTENTION !== null && (
        <AttentionWayIn ports={ATTENTION} wayIn={attentionTile} />
      )}
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/takes/")({
  component: Takes,
})
