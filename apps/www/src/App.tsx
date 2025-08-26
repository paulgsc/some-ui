import { CLUES } from "@input/data/crossword"

import "./App.css"

const App = () => {
  return (
    <main className="absolute inset-0 p-1.5">
      <Clues direction="across" clues={CLUES.across} />
    </main>
  )
}

export default App
