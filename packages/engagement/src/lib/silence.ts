/**
 * Silence (#3338): a module the build offers that nobody opens. The owner,
 * 2026-11-21: "Of key importance is 'silence'. App modules that we never
 * even open are a clear flag that they are just fancy graveyard apps." A
 * module is a pipeline of the registry (`./pipelines`), and how its opening
 * is known is its `opened` (`Opened`, `./registry`).
 *
 * Home reads each module's opens from its events (the friction aggregate,
 * `@some-ui/video-render`'s `friction.ts`). This names the silent ones, for
 * the weekly report, `pnpm report:vestiges` and the walkthroughs to say.
 * A module whose opening is not measured is never silent: it is said as
 * not measured, so no live module is called a graveyard for want of a
 * count. It is never a gate: deleting stays the owner's call.
 *
 * Dependency-free on purpose: `scripts/report-vestiges.ts` imports this file
 * by path, under Node's own type stripping.
 */

/**
 * How many whole weeks without an open make a module silent: four, the
 * friction aggregate's 28-day window, so silent is exactly "opened on no
 * day of the last 28" (C942). Policy, moved with the story (C771).
 */
export const SILENT_WEEKS = 4

/** A module's opens, as the friction aggregate holds them. */
export type ModuleOpens = {
  readonly pipeline: string
  readonly opened:
    | {
        readonly kind: "measured"
        /** Whole weeks since it was last opened; null when home holds no open of it. */
        readonly weeksQuiet: number | null
      }
    | { readonly kind: "not-measured" }
}

/** A silent module: which, and how long it has been quiet (null: never opened, as far as home knows). */
export type Silent = {
  readonly pipeline: string
  readonly weeksQuiet: number | null
}

/**
 * The silent modules of `modules`, the longest quiet first (never opened
 * before any), then by id: each measured one quiet for `weeks` or more.
 */
export function silentModules(
  modules: ReadonlyArray<ModuleOpens>,
  weeks: number = SILENT_WEEKS
): ReadonlyArray<Silent> {
  const silent: Array<Silent> = []
  for (const { pipeline, opened } of modules) {
    if (opened.kind !== "measured") continue
    if (opened.weeksQuiet === null || opened.weeksQuiet >= weeks)
      silent.push({ pipeline, weeksQuiet: opened.weeksQuiet })
  }
  const rank = (s: Silent): number => s.weeksQuiet ?? Number.POSITIVE_INFINITY
  return silent.sort(
    (a, b) => rank(b) - rank(a) || a.pipeline.localeCompare(b.pipeline)
  )
}
