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
  direction: Direction
}

export const ClueCarousel: FC<ClueCarouselProps> = ({
  className,
  direction,
}) => {
  const {
    cluesQueue: { cluesAcross, cluesDown },
  } = useClueQueueEvents()

  const queue = direction === "across" ? cluesAcross : cluesDown
  const { isLoading, error, rotationState } = useFetchViewportWasm({
    totalItems: queue?.length ?? 0,
    maxPerFace: 3,
  })

  const getClues = useCallback(() => {
    if (!rotationState || !queue) return []

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
  }, [rotationState, cluesAcross, cluesDown])

  console.log("this ran how many times!")
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  if (!rotationState) return <div> never began!</div>

  return (
    <DiceCard
      className={cn("size-full", className)}
      dof={"X-axis"}
      mode={"manual"}
      faces={getClues()}
    />
  )
}
