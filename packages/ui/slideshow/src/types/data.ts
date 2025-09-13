import { z } from "zod"

type Answers = {
  icon: string
  title: string
  description: string
}

export type Question = "What" | "How" | "Why"
type CubeFaceContent = {
  question: Question
  abstract: string
  answers: Array<Answers>
}

export type CubeJson = {
  faceId: string
  content: Array<CubeFaceContent>
}

const answersSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
})

const cubeFaceContentSchema = z.object({
  question: z.enum(["What", "How", "Why"]),
  abstract: z.string(),
  answers: z.array(answersSchema),
})

const cubeJsonSchema = z.array(
  z.object({
    faceId: z.string(),
    content: z.array(cubeFaceContentSchema),
  })
)

export type RotatingCubeType = z.infer<typeof cubeJsonSchema>
