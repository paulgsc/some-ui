export const Clues = ({
  clues,
  activeClue,
  activeDirection,
  solvedClues,
}: {
  clues: {
    across: Array<{ num: number; clue: string }>
    down: Array<{ num: number; clue: string }>
  }
  activeClue: number | null
  activeDirection: "across" | "down" | null
  solvedClues: Array<number>
}) => {
  return (
    <div className="grid grid-cols-2 gap-8">
      <div>
        <h2 className="mb-2 text-xl font-bold">Across</h2>
        <ul className="space-y-1">
          {clues.across.map((clue) => {
            const isActive =
              activeClue === clue.num && activeDirection === "across"
            const isSolved = solvedClues.includes(clue.num)

            return (
              <li
                key={`across-${clue.num}`}
                className={`flex rounded p-1 ${isActive ? "bg-yellow-100 font-bold" : ""} ${
                  isSolved ? "text-green-600" : ""
                }`}
              >
                <span className={`mr-2 ${isActive ? "text-pink-600" : ""}`}>
                  {clue.num}.
                </span>
                <span>{clue.clue}</span>
              </li>
            )
          })}
        </ul>
      </div>
      <div>
        <h2 className="mb-2 text-xl font-bold">Down</h2>
        <ul className="space-y-1">
          {clues.down.map((clue) => {
            const isActive =
              activeClue === clue.num && activeDirection === "down"
            const isSolved = solvedClues.includes(clue.num)
            return (
              <li
                key={`down-${clue.num}`}
                className={`flex rounded p-1 ${isActive ? "bg-yellow-100 font-bold" : ""} ${
                  isSolved ? "text-green-600" : ""
                }`}
              >
                <span className={`mr-2 ${isActive ? "text-pink-600" : ""}`}>
                  {clue.num}.
                </span>
                <span>{clue.clue}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
