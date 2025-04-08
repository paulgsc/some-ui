import type { FC } from "react"

type Clue = {
  num: number
  clue: string
}

type CluesProps = {
  clues: Array<Clue>
  direction: "across" | "down"
}

export const Clues: FC<CluesProps> = ({ clues, direction }) => {
  return (
    <ul className="grid grid-flow-row items-center justify-center gap-1">
      <h3 className="text-center text-xl font-bold uppercase">
        {" "}
        {direction === "across" ? "Across" : "Down"}{" "}
      </h3>
      {clues.map((clue, i) => (
        <li key={i} className="flex items-end justify-between gap-2.5">
          <p className="flex size-8 items-end justify-end text-end">
            {clue.num}
          </p>
          <p className="flex-grow">{clue.clue}</p>
        </li>
      ))}
    </ul>
  )
}
