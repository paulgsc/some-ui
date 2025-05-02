import type { FC } from "react"
import { useCallback } from "react"
import { ClueList } from "@input/components/clues-list"
import { useClueQueueEvents } from "@input/hooks/use-clue-queue-events"
import { useFetchViewportWasm } from "@input/hooks/use-viewport-rotation-wasm"
import type { Direction } from "@input/types/crossword"
import { DiceCard } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

type ClueCarouselProps = {
  className?: string
  cluesDirection: Direction
}

export const ClueCarousel: FC<ClueCarouselProps> = ({
  className,
  cluesDirection,
}) => {
  const {
    cluesQueue: { cluesAcross, cluesDown, direction },
  } = useClueQueueEvents()

  const queue = cluesDirection === "across" ? cluesAcross : cluesDown
  const { isLoading, error, rotationState } = useFetchViewportWasm({
    totalItems: queue?.length ?? 0,
    maxPerFace: 3,
    cluesDirection,
    stateDirection: direction,
  })

  const getClues = useCallback(() => {
    if (!rotationState || queue.length === 0) return []

    const { faceIndices, currFace, currIdx } = rotationState

    return faceIndices.map((indices, i) => {
      const clues = indices.map((indice) => queue[indice])
      const args = {
        key: `crossword_clues_${i}`,
        clues,
        isActive: currFace === i,
        activeIndex: currIdx,
      }
      const { key, ...rest } = args
      return <ClueList key={key} {...rest} />
    })
  }, [queue, rotationState])

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  if (!rotationState) return <div> never began!</div>

  return (
    <DiceCard
      className={cn("size-full w-10/12", className)}
      dof={"X-axis"}
      mode={"manual"}
      faces={getClues()}
    />
  )
}
