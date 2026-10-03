/**
 * The shape of the lines-of-code snapshot: what `scripts/loc-snapshot.ts`
 * writes before a build and what the header's `LocIndicator` reads.
 *
 * The file is `src/generated/loc-snapshot.json`. It is *tracked* as an empty
 * placeholder (`through: null`) that a pipeline overwrites right before it
 * builds, and not git-ignored, because of what the pipelines do with files:
 * the Docker build's `turbo prune` drops anything git ignores, and turbo only
 * folds a file into a build's cache key when it is not ignored. An ignored
 * snapshot would be missing from the image and, elsewhere, stale from cache.
 * A placeholder shows the feature as absent, so a checkout that never ran the
 * script (every local one, by default) ships no widget rather than a broken
 * one.
 *
 * Only the bundle imports this. The generator (`scripts/loc-snapshot.ts`,
 * through `collect.ts`) must run with nothing installed, so it does not load
 * `zod`; `collect.ts` says why and its test checks the output against this.
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
 * A snapshot for the widget, or `null` when there is nothing to show: the
 * placeholder, or a file that does not match the shape. The widget is an
 * optional extra, so a bad file hides it instead of breaking the page.
 */
export function readSnapshot(raw: unknown): LocSnapshot | null {
  const parsed = snapshot.safeParse(raw)
  if (!parsed.success) return null
  const { through, generatedAt } = parsed.data
  if (through === null) return null
  return { ...parsed.data, through, generatedAt: generatedAt ?? through }
}
