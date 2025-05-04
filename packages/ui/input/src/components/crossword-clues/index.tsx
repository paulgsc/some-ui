import type { FC } from "react"
import { CluesCarousel } from "@input/components/clues-carousel"
import { CrosswordGridSvg } from "@input/components/crossword-svg"
import { useClueQueueEvents } from "@input/hooks/use-clue-queue-events"
import { useViewportManager } from "@input/hooks/use-viewport-rotation-wasm"

type CluesProps = {}

export const Clues: FC<CluesProps> = () => {
  const {
    cluesQueue: { cluesAcross, cluesDown, direction },
  } = useClueQueueEvents()

  const { viewportStates, isLoading, error } = useViewportManager({
    maxPerFace: 3,
    activeCube: direction,
  })

  if (isLoading) return <div>Loading viewports...</div>
  if (error) return <div>Error: {error}</div>

  const acrossArgs = {
    clueCardId: "across",
    rotationState: viewportStates.across,
    directionalClues: cluesAcross,
  }
  const downArgs = {
    clueCardId: "down",
    rotationState: viewportStates.down,
    directionalClues: cluesDown,
  }

  return (
    <div className="absolute inset-0 grid size-full auto-cols-[2fr_4fr_2fr] grid-flow-col">
      <aside className="relative flex size-full items-center justify-center border border-red-100">
        <CluesCarousel className="h-3/4 w-10/12" {...acrossArgs} />
      </aside>
      <main className="relative border border-red-100">
        <CrosswordGridSvg duration={10 * 1000} className="absolute inset-0" />
      </main>
      <aside className="relative flex size-full items-center justify-center border border-red-100">
        <CluesCarousel className="h-3/4 w-10/12" {...downArgs} />
      </aside>
    </div>
  )
}
