import { apiHooks, apiUrl } from "@some-ui/fetch-kit"
import { z } from "zod"

const dataItem = z.object({
  name: z.string(),
  value: z.number(),
  imageUrl: z.string(),
  properties: z.record(z.string(), z.any()).optional(),
})

const sheetDataItem = z.object({
  name: z.string(),
  standings: z.array(dataItem),
})

const metadata = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
})

const nflTennisResponse = z.object({
  data: z.array(sheetDataItem),
  metadata: metadata,
})

const fileId = "1CcNKPheAtAIuLIVn41rsrn6AZ-JkKuNappj-mzMbZqc"
const url = apiUrl(`/get_nfl_tennis/${fileId}`)
export const useNflTennis = apiHooks.createQueryHook(
  url,
  nflTennisResponse,
  "GET"
)
