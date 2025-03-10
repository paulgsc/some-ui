import { apiHooks } from "maishatu-fetch-kit"
import { z } from "zod"

export const AttributionSchema = z.object({
  source_type: z.enum([
    "Book",
    "Website",
    "Data",
    "Document",
    "SatelliteData",
    "Image",
    "Music",
    "Video",
    "Code",
  ]),
  title: z.string(),
  author: z.string(),
  url: z.string().optional(),
  license: z.string(),
  thanks: z.string(),
  thumbnail: z.string().optional(),
})
export const AttributionArraySchema = z.array(AttributionSchema)

const fileId = "1CN87_6FFZhSS3jYkJ8KobSaXDuUYzCICPRa79lPdc7E"
const url = new URL(`http://nixos.local:3000/gsheet/${fileId}`)
export const useGetCredits = apiHooks.createQueryHook(
  url,
  AttributionArraySchema,
  "GET"
)
