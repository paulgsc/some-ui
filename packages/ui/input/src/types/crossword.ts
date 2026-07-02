// types file
import { z } from "zod"

export const WordPlacementSchema = z.object({
  word: z.string(),
  startX: z.number().int(),
  startY: z.number().int(),
  isAcross: z.boolean(),
  groupId: z.number().int().nullable(),
  clueNum: z.number().int(),
})

export type WordPlacement = z.infer<typeof WordPlacementSchema>

export const CrosswordResultSchema = z.object({
  grid: z.array(z.string()),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  wordPlacements: z.array(WordPlacementSchema),
})

export type CrosswordResult = z.infer<typeof CrosswordResultSchema>

export type Direction = "across" | "down"

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

export type Word = {
  x: number
  y: number
  direction: Direction
  length: number
  clueNumber?: number
  word?: string
}

export type CrosswordGrid = {
  words: Array<Word>
  size: number
}

export type CrosswordClueWithNum = {
  clueNum: number
} & CrosswordClue

export type CrosswordClues = Record<Direction, Array<CrosswordClueWithNum>>
