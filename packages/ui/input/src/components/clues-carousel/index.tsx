import type { FC } from "react"
import { useCallback } from "react"
import { ClueList } from "@input/components/clues-list"
import { useClueQueueEvents } from "@input/hooks/use-clue-queue-events"
import type { CrosswordClueWithNum, Direction } from "@input/types/crossword"
import { DiceCard } from "@some-ui/dice-card"
import { cn } from "some-ui-utils"

type ClueCarouselProps = {
  className?: string
  direction: Direction
}

export const CluesCarousel: FC<ClueCarouselProps> = ({
  className,
  direction,
}) => {
  const {
    viewportStates: { across, down },
    cluesQueue: { cluesAcross, cluesDown },
  } = useClueQueueEvents()

  const getClues = useCallback(() => {
    const rotationState = direction === "across" ? across : down
    const directionalClues = direction === "across" ? cluesAcross : cluesDown

    if (
      !rotationState ||
      Object.entries(rotationState).length === 0 ||
      directionalClues.length === 0
    ) {
      return []
    }

    const { faceIndices, currIdx } = rotationState
    if (faceIndices.length === 0) return []

    const result: Array<React.JSX.Element> = []

    for (let i = 0; i < faceIndices.length; i++) {
      const indices = faceIndices[i] ?? []
      const clues: Array<CrosswordClueWithNum> = []

      for (let j = 0; j < indices.length; j++) {
        const indice = indices[j]

        if (indice === undefined) continue

        const clue = directionalClues[indice]

        if (!clue) {
          // eslint-disable-next-line no-console
          console.error(
            `Invalid clue index: directionalClues[${indice}] is undefined at faceIndices[${i}][${j}].`
          )
          // eslint-disable-next-line no-console
          console.info(
            "faceIndices, directionalClues",
            faceIndices,
            directionalClues
          )
          return []
        }

        clues.push(clue)
      }

      const args = {
        key: `crossword_clues_${i}`,
        title: direction === "across" ? "Across" : "Down",
        clues,
        activeIndex: currIdx,
      }

      const { key, ...rest } = args
      result.push(<ClueList key={key} {...rest} />)
    }

    return result
  }, [across, down, cluesAcross, cluesDown, direction])

  return (
    <DiceCard
      className={cn("size-full w-10/12", className)}
      dof={"Y-axis"}
      mode={"manual"}
      faces={getClues()}
      cubeId={direction}
    />
  )
}
