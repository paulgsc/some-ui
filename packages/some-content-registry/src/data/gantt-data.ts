import { apiHooks, apiUrl } from "@some-ui/fetch-kit"
import { z } from "zod"

const createChapterSchema = (): z.ZodObject<{
  id: z.ZodString
  title: z.ZodString
  startTime: z.ZodNumber
  endTime: z.ZodNumber
  description: z.ZodString
  color: z.ZodString
}> =>
  z.object({
    id: z.string(),
    title: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    description: z.string(),
    color: z.string(),
  })

const chaptersSchema = createChapterSchema()

const ganttSchema = z.object({
  ...createChapterSchema().shape,
  subChapters: z.array(chaptersSchema),
})

const ganttSchemaArray = z.array(ganttSchema)

const fileId = "1CN87_6FFZhSS3jYkJ8KobSaXDuUYzCICPRa79lPdc7E"
const url = apiUrl(`/get_gantt/${fileId}`)
export const useGanttChapters = apiHooks.createQueryHook(
  url,
  ganttSchemaArray,
  "GET"
)
