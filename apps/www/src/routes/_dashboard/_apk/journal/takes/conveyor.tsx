import type { ComponentProps, JSX } from "react"
import type { LibraryTake } from "@some-ui/soundbites"
import { STUDIO_WORDS, TakeLibrary } from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"
import { createFileRoute } from "@tanstack/react-router"

import { libraryStations, takeConveyor } from "@/lib/take-conveyor"
import { TAKE_CONVEYOR_WORDS } from "@/lib/take-conveyor/words"
import { takesHome } from "@/lib/take-library"
import { PairHomeLink } from "@/components/pair-home-link"
import { StudioPage } from "@/components/studio/layout"
import { TakeSorting } from "@/components/studio/take-conveyor"

const WORDS = TAKE_CONVEYOR_WORDS.page

/** Home, a player and the phone's moves, made on first use. */
let ports: ComponentProps<typeof TakeLibrary>["ports"] | null = null

/** Each take's place on the conveyor, under its row. */
const sortingRow = (take: LibraryTake): JSX.Element => (
  <TakeSorting take={take} conveyor={takeConveyor()} />
)

/**
 * Studio › Takes › On the conveyor (CONVEYOR2, #2874): every take home
 * keeps, on Takes on home's list (listen, search), each with where it stands
 * and its moves beneath it. The one page a take is moved on, so the one
 * where it is made Ready for pickup.
 */
const ConveyorPage = (): JSX.Element => {
  ports ??= {
    home: takesHome,
    player: audioPlayer,
    stations: libraryStations(),
  }
  return (
    <StudioPage heading={WORDS.heading} back="takes">
      <p className="text-muted-foreground text-sm">{WORDS.intro}</p>
      <TakeLibrary
        ports={ports}
        pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
        row={sortingRow}
      />
    </StudioPage>
  )
}

/**
 * The page and its words exist only in the Android app (`build.paths.ts`),
 * as Renders' do.
 */
const Page: () => JSX.Element | null =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? ConveyorPage
    : (): null => null

export const Route = createFileRoute("/_dashboard/_apk/journal/takes/conveyor")(
  { component: Page }
)
