import "./index.css"

import type { FC, HTMLAttributes, ReactNode } from "react"
import { forwardRef } from "react"

import { cn } from "../../../lib/utils"
import type { CSSVarProperties } from "../../../types"

export const Deck = forwardRef<
  HTMLUListElement,
  HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    style={{}}
    className={cn(
      "grid grid-cols-1 grid-rows-1 will-change-transform",
      "animate-deck-float",
      className
    )}
    {...props}
  />
))

Deck.displayName = "Deck"

type DeckCardProps = {
  duration?: number
  iteration?: "infinite" | number
  yOffset?: number
  scaleOffset?: number
  scale: number
  index: number
}

export const DeckCard = forwardRef<
  HTMLLIElement,
  HTMLAttributes<HTMLLIElement> & DeckCardProps
>(
  (
    {
      className,
      duration = 1.2,
      yOffset = 60,
      scaleOffset = 0.02,
      iteration = 3,
      index,
      scale,
      ...props
    },
    ref
  ) => {
    const cardStyle: CSSVarProperties = {
      "--y-offset": yOffset,
      "--animation-duration": `${duration}s`,
      "--animation-iteration-count": iteration,
      "--scale-offset": scaleOffset,
      "--card-scale": scale,
      "--card-index": -index,
    }

    return (
      <li
        ref={ref}
        style={cardStyle}
        className={cn(
          "col-start-1 col-end-1 row-start-1 row-end-1 flex aspect-[2.5/3.5] w-[23vmin]",
          "rounded-2xl border border-border bg-card shadow-lg",
          "transform transition-transform will-change-transform",
          "[transform:translateY(calc(var(--card-index)*0.5px))]",
          "animate-deck-card",
          className
        )}
        {...props}
      />
    )
  }
)

DeckCard.displayName = "DeckCard"

type DeckShuffleProps = {
  containerClassname?: string
  cardClassname?: string
  count: number
  contents: Array<ReactNode>
} & DeckCardProps

export const DeckShuffle: FC<DeckShuffleProps> = ({
  containerClassname,
  cardClassname,
  count,
  contents,
  scaleOffset = 0.02,
}) => {
  return (
    <Deck className={cn(containerClassname, "")}>
      {contents.map((content, i) => {
        const scale =
          i <= Math.floor(count / 2)
            ? (i - 1) * scaleOffset
            : 1 - (count - 1 - i) * scaleOffset

        return (
          <DeckCard
            // Position in the deck IS the card's identity here: `contents` is an
            // opaque ReactNode list and the same index drives stacking order.
            // eslint-disable-next-line react/no-array-index-key -- deck position is the identity
            key={i}
            index={i}
            className={cn(cardClassname, "")}
            scale={scale}
          >
            {content}
          </DeckCard>
        )
      })}
    </Deck>
  )
}
