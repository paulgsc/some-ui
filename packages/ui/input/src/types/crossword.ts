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
  direction: Direction
  word: string
  clueNum?: number
  clueNums: Array<number>
  letter?: string
  solved: boolean
}

export type CrosswordClue = {
  clue: string
  word: string
  thumbnail?: string
}

export type CrosswordClueWithNum = {
  clueNum: number
} & CrosswordClue

export type CrosswordClues = Record<Direction, Array<CrosswordClueWithNum>>
