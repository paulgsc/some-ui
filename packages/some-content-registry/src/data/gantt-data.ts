import {
  API_V1_PREFIX,
  apiHooks,
  DEFAULT_API_BASE_URL,
} from "@some-ui/fetch-kit"
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
// `/get_gantt/:id` is not one of file_host's registered routes - it's absent
// from both routes.server.json and the generated ServerRoute union
// (some-ui#1040), so it can't go through the now-typed `apiUrl`. Built by
// hand here, byte-identical to what the old untyped `apiUrl(`/get_gantt/${fileId}`)`
// produced, until someone confirms what actually serves this and either
// registers it on file_host or points this at wherever it really lives.
const url = new URL(
  `${API_V1_PREFIX}/get_gantt/${fileId}`,
  DEFAULT_API_BASE_URL
)
export const useGanttChapters = apiHooks.createQueryHook(
  url,
  ganttSchemaArray,
  "GET"
)
