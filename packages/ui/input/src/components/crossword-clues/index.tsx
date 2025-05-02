import type { FC } from "react"
import { ClueCarousel } from "@input/components/clue-carousel"
import { CrosswordGridSvg } from "@input/components/crossword-svg"

type CluesProps = {}

export const Clues: FC<CluesProps> = () => {
  return (
    <div className="absolute inset-0 grid size-full auto-cols-[2fr_4fr_2fr] grid-flow-col">
      <aside className="relative flex size-full items-center justify-center border border-red-100">
        <ClueCarousel cluesDirection="across" className="h-1/2 w-10/12" />
      </aside>
      <main className="relative border border-red-100">
        <CrosswordGridSvg />
      </main>
      <aside className="relative flex size-full items-center justify-center border border-red-100">
        <ClueCarousel cluesDirection="down" className="h-1/2 w-10/12" />
      </aside>
    </div>
  )
}
