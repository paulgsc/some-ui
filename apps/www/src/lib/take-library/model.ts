/**
 * Home's answer to `GET /voice-notes/takes` (paulgsc/server, ST32), read as
 * Takes on home means it: pure, so every answer can be held by a test.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { LibraryPage, LibraryRead } from "@some-ui/soundbites"
import { z } from "zod"

/** One take, as the route serves it; fields home adds are dropped. */
const TakeSchema = z.object({
  id: z.string().min(1),
  ref: z.string(),
  recordedAt: z.string().min(1),
  storedAt: z.string().min(1),
  size: z.number().int().nonnegative(),
  setAsideAt: z.string().min(1).nullable(),
  heard: z
    .object({
      text: z.string(),
      language: z.string().nullable(),
      model: z.string(),
      heardAt: z.string().min(1),
    })
    .nullable(),
})

const TakesSchema: z.ZodType<LibraryPage> = z.object({
  takes: z.array(TakeSchema),
  total: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative().nullable(),
  // "meaning" is home's once its index of meaning lands; read it already.
  by: z.enum(["newest", "words", "meaning"]),
})

/** What home's answer says, for the screen. */
export function readTakes(answer: HomeAnswer): LibraryRead {
  // A home before the route serves no such path.
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const page = readAs(TakesSchema, answer.body)
  return page === null ? { kind: "unreadable" } : { kind: "read", page }
}
