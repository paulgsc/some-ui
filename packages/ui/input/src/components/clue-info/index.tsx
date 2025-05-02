import type { FC } from "react"
import { PolarSphere } from "some-ui-shared"
import { cn } from "some-ui-utils"

type ClueInfoProps = {
  clue: string
  clueNum: number
  isActive?: boolean
}

export const ClueInfo: FC<ClueInfoProps> = ({
  clue,
  clueNum,
  isActive = false,
}) => {
  const powerballArgs = {
    width: 80,
    height: 80,
    radius: 40,
    rotationSpeed: 1,
    polarNum: clueNum,
  }
  return (
    <div className="flex min-w-0 flex-1 flex-row-reverse items-start justify-end gap-2.5 py-1.5">
      <h3
        className={cn(
          "line-clamp-2 h-full flex-grow text-balance text-lg font-bold tracking-tight transition-colors duration-300",
          isActive ? "text-blue-700" : "text-neutral-900"
        )}
      >
        {clue}
      </h3>
      <div className="inset-y-3/5 translate-x-2/5 absolute inset-x-0 bottom-2 left-1/4 size-12">
        <PolarSphere {...powerballArgs} />
      </div>
    </div>
  )
}
