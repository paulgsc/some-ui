import { apiHooks } from "maishatu-fetch-kit"
import { z } from "zod"

const quarterPoints = z.object({
  name: z.string(),
  value: z.number(),
})

const metadata = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
})

const quarterPointsResponse = z.object({
  data: z.array(quarterPoints),
  metadata: metadata,
})

const fileId = "1CN87_6FFZhSS3jYkJ8KobSaXDuUYzCICPRa79lPdc7E"
const url = new URL(`http://nixos.local:3000/get_nfl_tennis/${fileId}`)
export const useNflTennis = apiHooks.createQueryHook(
  url,
  quarterPointsResponse,
  "GET"
)
