import { apiHooks, apiUrl } from "@some-ui/fetch-kit"
import { z } from "zod"

const dataItem = z.object({
  id: z.number().min(0),
  jerseyNumber: z.string(),
  name: z.string(),
  position: z.string(),
  draftPick: z.string(),
  label: z.string(),
  weight: z.number(),
  color: z.number(),
})

const nflRosterResponse = z.array(dataItem)

const fileId = "1vWtqEmAklRVr88p4pXtuLIecfYVKDvJUtyWLwoWUV_o"
const url = apiUrl(`/get_nfl_roster/${fileId}`)
export const useNflRoster = apiHooks.createQueryHook(
  url,
  nflRosterResponse,
  "GET"
)
