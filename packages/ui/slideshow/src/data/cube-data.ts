import type { Question } from "@slideshow/types"
import { z } from "zod"

// Validate the JSON
import rawJson from "./cube-data.json"

// Define the schema
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

export const result = cubeJsonSchema.safeParse(rawJson)

type CubeJson = z.infer<typeof cubeJsonSchema>

export function filterCubeJson(
  cubeJsonData: CubeJson,
  faceId: string,
  question?: Question
): CubeJson[number]["content"] {
  return (
    cubeJsonData
      .find((d) => d.faceId === faceId)
      ?.content.filter((c) => !question || c.question === question) ?? []
  )
}
