import type { FC, RefObject } from "react"
import { useRef } from "react"
import { NflPlayerCard } from "@nfl/components/player-card"
import { Deck, DeckCard } from "some-ui-shared"
import { cn, useMeasureRect } from "some-ui-utils"

export const NflPlayerCardShuffle: FC = () => {
  const scaleOffset = 0.02
  const count = 12
  const ref = useRef<HTMLDivElement>(null)

  const { width, height } = useMeasureRect({
    ref: ref as RefObject<HTMLElement>,
  })

  return (
    <Deck className={cn("")}>
      {Array.from({ length: count }).map((_, i) => {
        const scale =
          i <= Math.floor(count / 2)
            ? (i - 1) * scaleOffset
            : 1 - (count - 1 - i) * scaleOffset

        return (
          <DeckCard
            key={i}
            ref={ref}
            index={i}
            className={cn(
              "pointer-events-none rounded-none border-none bg-none p-0.5"
            )}
            scale={scale}
          >
            <NflPlayerCard
              height={height}
              width={width}
              className="absolute-0 inset-0"
            />
          </DeckCard>
        )
      })}
    </Deck>
  )
}
