import type { FC } from "react"
import { AttributionCard } from "@attributions/components/attribution-card"
import type { Attribution } from "@attributions/types/attribution"
import { cn } from "some-ui-utils"

type ScrollingCreditsProps = {
  className?: string
  credits: Array<Attribution>
}

export const ScrollingCredits: FC<ScrollingCreditsProps> = ({
  className,
  credits,
}) => {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-clip bg-gradient-to-br from-gray-100 to-gray-300 invert",
        className
      )}
    >
      <div className="relative size-full">
        <div
          className={cn(
            "inset-1/8 absolute text-center",
            "space-y-96",
            "animate-credits-scroll"
          )}
        >
          <h1 className="mb-12 text-5xl">Ending Credits & Attributions</h1>

          {credits.map((credit, index) => (
            <AttributionCard key={index} attribution={credit} />
          ))}
        </div>
      </div>
    </div>
  )
}
