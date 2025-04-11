export type Direction = "across" | "down"

export type WordPlacement = {
  word: string
  start_x: number
  start_y: number
  is_across: boolean
  group_id: number | null
  clue_num: number
}

export type CrosswordResult = {
  grid: Array<string>
  width: number
  height: number
  word_placements: Array<WordPlacement>
}
export type CrosswordCell = {
  x: number
  y: number
  num?: number
  letter?: string
  solved: boolean
}

type CrosswordClue = {
  id: number
  clue: string
  answer: string
}

export type CrosswordClues = Record<Direction, Array<CrosswordClue>>
