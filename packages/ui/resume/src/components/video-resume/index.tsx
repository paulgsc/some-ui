import type { FC } from "react"
import { mockProfileCards } from "@resume/data/video-resume"
import { PlayerCardDialog } from "some-ui-nfl"
import { Deck, DeckCard } from "some-ui-shared"
import { cn } from "some-ui-utils"

export const ResumeProfileCard: FC = () => {
  const scaleOffset = 0.02
  const count = 12

  return (
    <Deck className={cn("")}>
      {mockProfileCards.map((profile, i) => {
        const scale =
          i <= Math.floor(count / 2)
            ? (i - 1) * scaleOffset
            : 1 - (count - 1 - i) * scaleOffset

        const props = {
          title: profile.title,
          href: profile.href,
          description: profile.description,
        }

        return (
          <DeckCard
            key={i}
            index={i}
            className={cn("rounded-none border-none bg-none p-0.5")}
            scale={scale}
          >
            <PlayerCardDialog {...props} />
          </DeckCard>
        )
      })}
    </Deck>
  )
}
