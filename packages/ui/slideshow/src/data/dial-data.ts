import { apiHooks } from "@some-ui/fetch-kit"
import { z } from "zod"

const sectionSchema = z.object({
  id: z.number(),
  title: z.string(),
  color: z.string(),
  details: z.string(),
})

const sectionSchemaArray = z.array(sectionSchema)

const fileId = "1CN87_6FFZhSS3jYkJ8KobSaXDuUYzCICPRa79lPdc7E"
const url = new URL(`http://nixos.local:3000/get_video_chapters/${fileId}`)
export const useVideoChapters = apiHooks.createQueryHook(
  url,
  sectionSchemaArray,
  "GET"
)
