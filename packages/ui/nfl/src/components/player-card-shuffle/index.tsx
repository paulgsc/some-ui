import type { FC } from "react"
import { PlayerCardDialog } from "@nfl/components/player-card-dialog"
import { Deck, DeckCard } from "@some-ui/shared"
import { cn } from "some-ui-utils"

export const NflPlayerCardShuffle: FC = () => {
  const scaleOffset = 0.02
  const count = 12

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
            index={i}
            className={cn("rounded-none border-none bg-none p-0.5")}
            scale={scale}
          >
            <PlayerCardDialog
              title="title"
              href="href"
              description="description"
            />
          </DeckCard>
        )
      })}
    </Deck>
  )
}
