import { CrosswordGridSvg } from "some-ui-input"

const CrosswordPuzzle = (): React.JSX.Element => {
  const wordList = [
    "JAVASCRIPT",
    "TYPESCRIPT",
    "REACT",
    "ANGULAR",
    "VUE",
    "NODE",
    "EXPRESS",
    "MONGODB",
    "HTML",
    "CSS",
    "REDUX",
    "WEBPACK",
    "BABEL",
    "PROGRAMMING",
    "ALGORITHM",
    "CODING",
    "FUNCTION",
    "VARIABLE",
    "OBJECT",
    "ARRAY",
  ]

  return <CrosswordGridSvg words={wordList} />
}

export default CrosswordPuzzle
