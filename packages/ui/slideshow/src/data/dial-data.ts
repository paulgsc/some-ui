import {
  API_V1_PREFIX,
  apiHooks,
  DEFAULT_API_BASE_URL,
} from "@some-ui/fetch-kit"
import { z } from "zod"

const sectionSchema = z.object({
  id: z.number(),
  title: z.string(),
  color: z.string(),
  details: z.string(),
})

const sectionSchemaArray = z.array(sectionSchema)

const fileId = "1CN87_6FFZhSS3jYkJ8KobSaXDuUYzCICPRa79lPdc7E"
// `/get_video_chapters/:id` is not one of file_host's registered routes -
// it's absent from both routes.server.json and the generated ServerRoute
// union (some-ui#1040), so it can't go through the now-typed `apiUrl`. Built
// by hand here, byte-identical to what the old untyped
// `apiUrl(`/get_video_chapters/${fileId}`)` produced, until someone confirms
// what actually serves this and either registers it on file_host or points
// this at wherever it really lives.
const url = new URL(
  `${API_V1_PREFIX}/get_video_chapters/${fileId}`,
  DEFAULT_API_BASE_URL
)
export const useVideoChapters = apiHooks.createQueryHook(
  url,
  sectionSchemaArray,
  "GET"
)
