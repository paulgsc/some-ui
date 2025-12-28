import type { FC } from "react"
import { CluesCarousel } from "@input/components/clues-carousel"
import { ViewportCrosswordGrid } from "@input/components/viewport-crossword-svg"

type CluesProps = {}

export const Clues: FC<CluesProps> = () => {
  return (
    <div className="absolute inset-0 grid size-full auto-cols-[2fr_4fr_2fr] grid-flow-col">
      <aside className="relative flex size-full items-center justify-center border border-red-100">
        <CluesCarousel className="h-3/4 w-10/12" direction="across" />
      </aside>
      <main className="relative border border-red-100">
        <ViewportCrosswordGrid />
      </main>
      <aside className="relative flex size-full items-center justify-center border border-red-100">
        <CluesCarousel className="h-3/4 w-10/12" direction="down" />
      </aside>
    </div>
  )
}
