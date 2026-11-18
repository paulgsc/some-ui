/**
 * Home's answer to `GET /voice-notes/takes` (paulgsc/server, ST32), read as
 * Takes on home means it: pure, so every answer can be held by a test.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { LibraryPage, LibraryRead, PhoneTake } from "@some-ui/soundbites"
import { isTakeOf } from "@some-ui/soundbites"
import { z } from "zod"

import type { PhoneBite } from "@/lib/game-bites"
import type { OnPhone } from "@/lib/home-link/voice-copy"
import { isTakeStation } from "@/lib/take-conveyor/model"

/** One take, as the route serves it; fields home adds are dropped. */
const TakeSchema = z.object({
  id: z.string().min(1),
  // Its kind (TAKES20): a home before it says none, and lists Studio's
  // alone; a kind this phone doesn't know still shows, as another kind.
  of: z
    .unknown()
    .transform((value) =>
      value === undefined ? undefined : isTakeOf(value) ? value : "unknown"
    )
    .optional(),
  // What a kind keeps beside its ref (a game bite's moment); none read
  // from a value this phone can't.
  fields: z.record(z.string(), z.string()).optional().catch(undefined),
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
  // Where it is on the conveyor (CONVEYOR1): null for a take on none (an
  // idea's answer); a home before it says neither, and a station this phone
  // doesn't know reads as none said.
  station: z
    .unknown()
    .transform((value) =>
      value === null ? null : isTakeStation(value) ? value : undefined
    )
    .optional(),
  stationAt: z.string().min(1).nullable().optional().catch(undefined),
  stationSeq: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .catch(undefined),
})

const TakesSchema = z.object({
  takes: z.array(TakeSchema),
  total: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative().nullable(),
  // "meaning" is home's once its index of meaning lands; read it already.
  by: z.enum(["newest", "words", "meaning"]),
})

/**
 * Whether home listed every kind (TAKES20): a take that says its kind says
 * so; a list of Studio's alone, with none that does, is a home before it.
 * An empty list says neither.
 */
function coversOf(
  takes: ReadonlyArray<{ readonly of?: unknown }>
): LibraryPage["covers"] {
  if (takes.length === 0) return undefined
  return takes.some(({ of }) => of !== undefined) ? "every" : "studio"
}

/** What home's answer says, for the screen. */
export function readTakes(answer: HomeAnswer): LibraryRead {
  // A home before the route serves no such path.
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const page = readAs(TakesSchema, answer.body)
  if (page === null) return { kind: "unreadable" }
  return { kind: "read", page: { ...page, covers: coversOf(page.takes) } }
}

/**
 * This phone's takes of every kind, for Takes (TAKES20): each recording still
 * here (`recordingsOnPhone`), saying whether home holds it (`held`), and each
 * game bite home holds whose audio has left this phone, which plays from
 * home (`homeAudio`). Studio's takes are listed too; Takes leaves out those
 * home lists and those its recorder shows.
 */
export function phoneTakesOf(
  notes: ReadonlyArray<OnPhone>,
  bites: ReadonlyArray<PhoneBite>,
  held: (id: string) => boolean,
  homeAudio: (id: string) => Promise<Blob | null>
): ReadonlyArray<PhoneTake> {
  const here = notes.map(
    (note): PhoneTake => ({
      id: note.id,
      of: note.of,
      ref: note.ref,
      fields: note.fields,
      recordedAt: note.at,
      home: held(note.id),
      audio: note.audio,
    })
  )
  const listed = new Set(here.map(({ id }) => id))
  const gone = bites
    .filter(({ id }) => !listed.has(id))
    .map(
      (bite): PhoneTake => ({
        id: bite.id,
        of: "game",
        ref: bite.gameId,
        fields: bite.fields,
        recordedAt: bite.at,
        home: true,
        audio: () => homeAudio(bite.id),
      })
    )
  return [...here, ...gone]
}
