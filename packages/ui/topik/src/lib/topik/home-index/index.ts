import { z } from "zod"

const Instant = z.iso.datetime({ offset: true })

/**
 * Home's reflections index, as far as the run reads it to decide whether it
 * stands (ROUTINE.md, "Home's index"). Home writes the whole of it
 * (paulgsc/server `mailbox::index::reflections`); the run holds it to these
 * fields and nothing deeper.
 */
const HomeIndexSchema = z.object({
  schema: z.literal("some-ui.routine-index/1"),
  routine: z.literal("reflections"),
  /** When home last took in something it counts. */
  asOf: Instant.nullable(),
  /**
   * The first moment at which it would say something else with nothing new
   * arriving, or `null` when none is to come.
   */
  validUntil: Instant.nullable(),
  answered: z.object({
    scenes: z.array(z.string()),
    dramas: z.array(z.string()),
  }),
})

/**
 * A scene folder Drive holds, in `Read aloud/sets` or under
 * `Read aloud/archive/`, by its name and description.
 */
export type DriveFolder = {
  readonly name: string
  readonly description: string
}

/** Whether home's index stands for this run, and what the run reads itself. */
export type ReflectionsStanding = {
  readonly stands: boolean
  /** Why it doesn't stand, in plain words; empty when it does. */
  readonly why: ReadonlyArray<string>
  /**
   * The bases of the routine's scene folders Drive holds that the index
   * does not name (`answers:` or `stock:`): read their decks for word ids,
   * and count them answered.
   */
  readonly lacking: ReadonlyArray<string>
}

/** The base a routine scene folder's description gives, or `null` for any other folder. */
const baseOf = (description: string): string | null =>
  /^(?:answers|stock): (\S+)$/.exec(description.trim())?.[1] ?? null

/**
 * ROUTINE.md, "Home's index": it stands for a run at `now` when it reads as
 * one and `now` is before its `validUntil` (or it has none). It names too the
 * routine scene folders Drive holds that home has not counted, whose decks
 * the run reads itself.
 */
export function reflectionsIndexStands(
  index: unknown,
  now: string,
  drive: ReadonlyArray<DriveFolder>
): ReflectionsStanding {
  const parsed = HomeIndexSchema.safeParse(index)
  if (!parsed.success) {
    return {
      stands: false,
      why: ["Home's index doesn't read as a reflections index."],
      lacking: [],
    }
  }
  const { validUntil, answered } = parsed.data
  const counted = new Set(answered.scenes)
  const lacking = [
    ...new Set(
      drive
        .map((folder) => baseOf(folder.description))
        .filter((base): base is string => base !== null)
        .filter((base) => !counted.has(base))
    ),
  ].sort()
  const why: Array<string> = []
  if (Number.isNaN(Date.parse(now))) {
    why.push("The run's own time doesn't read.")
  } else if (validUntil !== null && Date.parse(now) >= Date.parse(validUntil)) {
    why.push(
      `Home's index held until ${validUntil}, and home hasn't put a newer one since.`
    )
  }
  return { stands: why.length === 0, why, lacking }
}
