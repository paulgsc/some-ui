import type { FC } from "react"
import { useCallback } from "react"
import { ClueList } from "@input/components/clues-list"
import type { ViewportResponse } from "@input/hooks/use-viewport-rotation-wasm"
import type { CrosswordClueWithNum } from "@input/types/crossword"
import { DiceCard } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

type ClueCarouselProps = {
  className?: string
  clueCardId?: number | string
  rotationState: ViewportResponse["state"] | undefined
  directionalClues: Array<CrosswordClueWithNum>
}

export const CluesCarousel: FC<ClueCarouselProps> = ({
  className,
  clueCardId,
  rotationState,
  directionalClues,
}) => {
  const getClues = useCallback(() => {
    if (!rotationState || directionalClues.length === 0) return []
    const { faceIndices, currFace, currIdx } = rotationState

    if (faceIndices.length === 0) return []

    return faceIndices.map((indices, i) => {
      const clues = indices.map((indice) => {
        if (indice >= directionalClues.length) new Error("welp!")
        return directionalClues[indice]
      })
      const args = {
        key: `crossword_clues_${i}`,
        testIdx: i,
        clues,
        isActive: currFace === i,
        activeIndex: currIdx,
      }
      const { key, ...rest } = args
      return <ClueList key={key} {...rest} />
    })
  }, [rotationState, directionalClues])

  return (
    <DiceCard
      className={cn("size-full w-10/12", className)}
      dof={"Y-axis"}
      mode={"manual"}
      faces={getClues()}
      cubeId={clueCardId}
    />
  )
}
