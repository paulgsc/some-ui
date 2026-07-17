import type { NFLTeam } from "@nfl/components/nfl-team-icon"
import { apiHooks, apiUrl } from "@some-ui/fetch-kit"
import { z } from "zod"

// Use a custom Zod type so TypeScript maps name strictly to NFLTeam
const dataItem = z.object({
  name: z.custom<NFLTeam>((val) => typeof val === "string"),
  value: z.number(),
  imageUrl: z.string(),
  properties: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.record(z.string(), z.any())])
    )
    .optional(),
})

const sheetDataItem = z.object({
  name: z.string().optional(), // maps to weekLabel/id if needed, or we rename it
  standings: z.array(dataItem),
})

const metadata = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
})

export const nflTennisResponse = z.object({
  data: z.array(sheetDataItem),
  metadata: metadata,
})

// Export inferred types so the component can consume them directly
export type ApiNflTennisResponse = z.infer<typeof nflTennisResponse>
export type SheetDataItem = z.infer<typeof sheetDataItem>
export type Standing = z.infer<typeof dataItem>

const fileId = "1CcNKPheAtAIuLIVn41rsrn6AZ-JkKuNappj-mzMbZqc"
const url = apiUrl(`/get_nfl_tennis/${fileId}`)

export const useNflTennis = apiHooks.createQueryHook(
  url,
  nflTennisResponse,
  "GET"
)
