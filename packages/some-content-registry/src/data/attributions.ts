import {
  API_V1_PREFIX,
  apiHooks,
  DEFAULT_API_BASE_URL,
} from "@some-ui/fetch-kit"
import { z } from "zod"

export const sourceTypeSchema = z.enum([
  "Book",
  "Website",
  "Data",
  "Document",
  "SatelliteData",
  "Image",
  "Music",
  "Video",
  "Code",
])

const rowSchema = z.array(
  z.object({
    source_type: sourceTypeSchema,
    title: z.string(),
    author: z.string(),
    url: z.string().optional(),
    thanks: z.string(),
    license: z.string(),
    thumbnail: z.string().optional(),
  })
) // Each row is an array of strings
const tableSchema = z.array(rowSchema) // The whole table is an array of rows

const fileId = "1utpDGonbesfPlJsEo8Y6xBmVKO13W4JhB9Brm8qjc6A"
// `/gsheet/:id` is not one of file_host's registered routes - it's absent
// from both routes.server.json and the generated ServerRoute union
// (some-ui#1040), so it can't go through the now-typed `apiUrl`. Built by
// hand here, byte-identical to what the old untyped `apiUrl(`/gsheet/${fileId}`)`
// produced, until someone confirms what actually serves this and either
// registers it on file_host or points this at wherever it really lives.
const url = new URL(`${API_V1_PREFIX}/gsheet/${fileId}`, DEFAULT_API_BASE_URL)

export const useGetCredits = apiHooks.createQueryHook(url, tableSchema, "GET")
