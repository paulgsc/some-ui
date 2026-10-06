/**
 * The shape of the lines-of-code snapshot: what `scripts/loc-snapshot.ts`
 * writes before a build and what the header's `LocIndicator` reads.
 *
 * `src/generated/loc-snapshot.json` is *tracked* as an empty placeholder
 * (`through: null`) that a pipeline overwrites before building: an ignored
 * file would be dropped by `turbo prune` and left out of turbo's cache key. A
 * placeholder ships no widget rather than a broken one.
 *
 * Only the bundle imports this; the generator runs with nothing installed
 * (see `collect.ts`), and `collect.ts`'s test checks its output against it.
 */

import { z } from "zod"

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const count = z.number().int().nonnegative()

/**
 * One repository's lines on one day. `add` and `del` are the work; `genAdd`
 * and `genDel` are what lockfiles and generated files contributed, kept apart
 * so the widget can show either total without a second snapshot.
 */
const repoDay = z.object({
  add: count,
  del: count,
  genAdd: count,
  genDel: count,
})

const snapshot = z.object({
  version: z.literal(1),
  /** When the script ran. `null` only in the placeholder. */
  generatedAt: z.string().nullable(),
  /** The last day the snapshot covers. `null` only in the placeholder. */
  through: date.nullable(),
  /** The repositories that contributed, in display order. */
  repos: z.array(z.string()),
  /** Days with at least one counted commit, oldest first. Quiet days are absent. */
  days: z.array(z.object({ date, repos: z.record(z.string(), repoDay) })),
})

export type RepoDay = z.infer<typeof repoDay>

export type LocSnapshot = Omit<
  z.infer<typeof snapshot>,
  "through" | "generatedAt"
> & { through: string; generatedAt: string }

/**
 * A snapshot for the widget, or `null` (the placeholder, or a file that does
 * not match): a bad file hides the optional widget rather than breaking the
 * page.
 */
export function readSnapshot(raw: unknown): LocSnapshot | null {
  const parsed = snapshot.safeParse(raw)
  if (!parsed.success) return null
  const { through, generatedAt } = parsed.data
  if (through === null) return null
  return { ...parsed.data, through, generatedAt: generatedAt ?? through }
}
