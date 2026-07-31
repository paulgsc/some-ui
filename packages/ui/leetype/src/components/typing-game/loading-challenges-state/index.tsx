import type { FC } from "react"
import { Loader2 } from "lucide-react"

/**
 * The challenge picker, waiting on the host to decide what the pool is.
 *
 * Not a skeleton of the picker: a skeleton implies the shape underneath is
 * already known, and here it isn't — a fetched corpus may be a decomposed
 * curriculum (rendered as a ladder) or a flat pool (rendered as a grid), and
 * guessing wrong swaps the whole layout out from under the player the moment
 * the fetch lands. So this states what it is waiting for and shows nothing
 * selectable, which is also the point: the pick this blocks is one the player
 * could otherwise make against a pool about to be replaced.
 */
export const LoadingChallengesState: FC = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 py-20">
      <div className="relative">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full bg-primary/10" />
      </div>

      <div className="space-y-2 text-center">
        <h3 className="text-lg font-semibold text-card-foreground">
          Loading challenges
        </h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Fetching this environment&apos;s challenge set. The picker opens as
          soon as it lands.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <div className="h-2 w-2 animate-bounce rounded-full bg-primary" />
      </div>
    </div>
  )
}
