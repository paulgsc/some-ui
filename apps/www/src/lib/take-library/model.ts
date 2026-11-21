/**
 * Home's answer to `GET /voice-notes/takes` (paulgsc/server, ST32), read as
 * Takes on home means it: pure, so every answer can be held by a test.
 *
 * From contract epoch 19 (TAKES20, #3219), asked with `kind=all`, home lists
 * every kind: each take says its `kind`, how home keeps it (`status`), and
 * what it is about (`about`, by kind), and the answer says where the next
 * page starts (`next`). A home before it answers Studio's alone, as before.
 * A game's `about` carries home's name for the game (`label`) and the
 * bite's moment, which may be left out (`bite: null`); the rest of a kind's
 * `about` is what its ref already says, which Takes' ports read. Each take
 * may say whether home hears it again on the owner's ask (`hearAgain`,
 * `lib/hear-again`, #3339).
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { LibraryPage, LibraryRead, PhoneTake } from "@some-ui/soundbites"
import { TAKE_OFS } from "@some-ui/soundbites/contract"
import { z } from "zod"

import type { PhoneBite } from "@/lib/game-bites"
import { HearAgainSchema } from "@/lib/hear-again/model"
import type { OnPhone } from "@/lib/home-link/voice-copy"
import { isTakeStation } from "@/lib/take-conveyor/model"

/** One take, as the route serves it; fields home adds are dropped. */
const TakeSchema = z.object({
  id: z.string().min(1),
  // Its kind: a home before it says none, and lists Studio's
  // alone; a kind this phone doesn't know still shows, as another kind.
  kind: z
    .unknown()
    .transform((value) =>
      value === undefined
        ? undefined
        : (TAKE_OFS.find((of) => of === value) ?? "unknown")
    )
    .optional(),
  // How home keeps it; one this phone doesn't know reads as none said.
  status: z
    .enum(["kept", "set-aside", "recording-let-go", "deleted"])
    .optional()
    .catch(undefined),
  // What a game is about, as far as the phone reads it: home's name for the
  // game and the bite's moment. Anything else, or none, reads as nothing.
  about: z
    .object({
      label: z.string().min(1).nullable().optional().catch(undefined),
      bite: z
        .object({
          scenario: z.string().nullable().optional().catch(undefined),
          strip: z.string().nullable().optional().catch(undefined),
          started: z.string().nullable().optional().catch(undefined),
        })
        .nullable()
        .optional()
        .catch(undefined),
    })
    .nullable()
    .optional()
    .catch(undefined),
  // A deleted take keeps no ref, by design.
  ref: z.string().nullable(),
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
  hearAgain: HearAgainSchema,
})

const TakesSchema = z.object({
  takes: z.array(TakeSchema),
  total: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative().nullable(),
  // "meaning" is home's once its index of meaning lands; read it already.
  by: z.enum(["newest", "words", "meaning"]),
  // Where the next page starts; a home before it says nothing.
  next: z.string().min(1).nullable().optional(),
})

type ReadTake = z.infer<typeof TakeSchema>

/** A game's moment, by the names its port reads (`fields`). */
function gameFields(
  about: ReadTake["about"]
): Readonly<Record<string, string>> | undefined {
  if (about == null) return undefined
  const fields: Record<string, string> = {}
  if (about.label != null) fields.label = about.label
  const { scenario, strip, started } = about.bite ?? {}
  if (scenario != null) fields.scenario = scenario
  if (strip != null) fields.strip = strip
  if (started != null) fields.started = started
  return fields
}

/** One take as Takes means it. */
function asTake({
  kind,
  about,
  ref,
  ...take
}: ReadTake): LibraryPage["takes"][number] {
  return {
    ...take,
    of: kind,
    ref: ref ?? "",
    ...(kind === "game" ? { fields: gameFields(about) } : {}),
  }
}

/** What home's answer says, for the screen. */
export function readTakes(answer: HomeAnswer): LibraryRead {
  // A home before the route serves no such path.
  if (answer.status === 404) return { kind: "older" }
  if (answer.status !== 200) return { kind: "unreadable" }
  const page = readAs(TakesSchema, answer.body)
  if (page === null) return { kind: "unreadable" }
  return {
    kind: "read",
    page: {
      ...page,
      takes: page.takes.map(asTake),
      covers: page.next === undefined ? "studio" : "every",
    },
  }
}

/**
 * This phone's takes of every kind, for Takes: each recording still
 * here (`recordingsOnPhone`), saying whether home holds it (`held`), each
 * game bite home holds whose audio has left this phone, which plays from
 * home, and each bite still held back for Undo, which plays from here. Studio's takes are listed too; Takes leaves out those
 * home lists and those its recorder shows.
 */
export function phoneTakesOf(
  notes: ReadonlyArray<OnPhone>,
  bites: ReadonlyArray<PhoneBite>,
  held: (id: string) => boolean,
  audio: {
    /** A bite's audio on this phone. */
    readonly bite: (id: string) => Promise<Blob | null>
    /** A take's audio from home. */
    readonly home: (id: string) => Promise<Blob | null>
  }
): ReadonlyArray<PhoneTake> {
  const here = notes.map(
    (note): PhoneTake => ({
      id: note.id,
      of: note.of,
      ref: note.ref,
      fields: note.fields,
      recordedAt: note.at,
      home: held(note.id),
      // A note home holds may have let its audio go here (LG1): home's plays.
      audio: held(note.id)
        ? (): Promise<Blob | null> =>
            note
              .audio()
              .catch(() => {
                // Ignored: audio this phone can't read back is asked of home.
                return null
              })
              .then((here) => here ?? audio.home(note.id))
        : note.audio,
    })
  )
  const listed = new Set(here.map(({ id }) => id))
  // A bite not listed is one home holds (its audio gone from here), or one
  // still held back for Undo, not sent yet, whose audio is still here.
  const rest = bites
    .filter(({ id }) => !listed.has(id))
    .map((bite): PhoneTake => {
      const onHome = bite.homeSince !== undefined
      return {
        id: bite.id,
        of: "game",
        ref: bite.gameId,
        fields: bite.fields,
        recordedAt: bite.at,
        home: onHome,
        audio: () => (onHome ? audio.home(bite.id) : audio.bite(bite.id)),
      }
    })
  return [...here, ...rest]
}
