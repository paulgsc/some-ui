import { apiHooks } from "maishatu-fetch-kit"
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
const url = new URL(`http://nixos.local:3000/gsheet/${fileId}`)

export const useGetCredits = apiHooks.createQueryHook(url, tableSchema, "GET")
