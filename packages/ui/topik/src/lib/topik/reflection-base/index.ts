import { z } from "zod"

/**
 * The base the reflections routine gives a group of written reflections from
 * the mailbox (ROUTINE.md, step 3): one session's reflections on one day in
 * `America/Los_Angeles`. A scene answering the group carries the base in its
 * folder description and mailbox name.
 *
 * RB1 (ROUTINE.md, "What review holds"): two groups of one day never share a
 * base, and a scene under the earlier base answers a group only when no other
 * group of that day, answered or not, has the same one; `index.test.ts`,
 * "RB1", holds it over each id form, and the run takes bases only from
 * `scripts/base.mjs`.
 */

/** One session's written reflections on one day. */
export type ReflectionGroup = {
  /** The day of their `at` in `America/Los_Angeles`, as YYYY-MM-DD. */
  readonly day: string
  /** The session they are about, as the reflections name it. */
  readonly session: string
}

/** A group with the bases a scene answering it may carry. */
export type GroupBases = ReflectionGroup & {
  /** `<day>_reflection_<the session's last 8>`, what a run names a new scene. */
  readonly base: string
  /**
   * `<day>_reflection_<the session's first 8>`, as earlier runs named it,
   * while no other group of that day has the same one; `null` when one does,
   * since a scene named so answers none of them.
   */
  readonly earlier: string | null
}

/** The session id's letters, digits and `-`, as written. */
const kept = (session: string): string => session.replace(/[^A-Za-z0-9-]/g, "")

/** The base a run names a new scene for the group by: the session's last 8. */
export function baseOf(day: string, session: string): string {
  return `${day}_reflection_${kept(session).slice(-8)}`
}

/** The base earlier runs named a scene for the group by: the session's first 8. */
export function earlierBaseOf(day: string, session: string): string {
  return `${day}_reflection_${kept(session).slice(0, 8)}`
}

/**
 * Each of `groups`, once, with the bases a scene answering it may carry. Give
 * every group gathered, answered or not: whether an earlier base still names
 * one group depends on all of that day's.
 */
export function groupBases(
  groups: ReadonlyArray<ReflectionGroup>
): ReadonlyArray<GroupBases> {
  const unique = [
    ...new Map(groups.map((g) => [`${g.day}\n${g.session}`, g])).values(),
  ]
  const sharing = new Map<string, number>()
  for (const { day, session } of unique) {
    const earlier = earlierBaseOf(day, session)
    sharing.set(earlier, (sharing.get(earlier) ?? 0) + 1)
  }
  return unique.map(({ day, session }) => {
    const earlier = earlierBaseOf(day, session)
    return {
      day,
      session,
      base: baseOf(day, session),
      earlier: sharing.get(earlier) === 1 ? earlier : null,
    }
  })
}

const GroupsSchema = z.array(
  z.object({
    day: z.iso.date(),
    session: z.string().regex(/[A-Za-z0-9-]/),
  })
)

/** What `readGroups` makes of a file: its groups, or the entry it refuses. */
export type ReadGroups =
  | { readonly groups: ReadonlyArray<ReflectionGroup> }
  | {
      /** The first entry that doesn't read, as "entry 3's session". */
      readonly refused: string
    }

/** `raw` as groups, or the first entry that doesn't read as one. */
export function readGroups(raw: unknown): ReadGroups {
  const parsed = GroupsSchema.safeParse(raw)
  if (parsed.success) return { groups: parsed.data }
  const [index, field] = parsed.error.issues[0]?.path ?? []
  if (typeof index !== "number") return { refused: "the list" }
  const entry = `entry ${index + 1}`
  return { refused: typeof field === "string" ? `${entry}'s ${field}` : entry }
}
