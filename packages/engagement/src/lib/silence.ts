/**
 * Silence (#3338): a module the build offers that nobody opens. The owner,
 * 2026-11-21: "Of key importance is 'silence'. App modules that we never
 * even open are a clear flag that they are just fancy graveyard apps." A
 * module is a pipeline of the registry (`./pipelines`), and how its opening
 * is known is its `opened` (`Opened`, `./registry`).
 *
 * Home reads each module's root from its events, and a walkthrough's render
 * maps that onto the registry (the friction aggregate, `@some-ui/video-render`'s
 * `friction.ts`, kept as `friction.json`). This names the silent ones, for
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

/** Whether `m` is one module's opens, as the aggregate writes it. */
function isModuleOpens(m: unknown): m is ModuleOpens {
  if (typeof m !== "object" || m === null) return false
  if (!("pipeline" in m) || typeof m.pipeline !== "string") return false
  if (!("opened" in m) || typeof m.opened !== "object" || m.opened === null)
    return false
  const { opened } = m
  if (!("kind" in opened)) return false
  if (opened.kind === "not-measured") return true
  return (
    opened.kind === "measured" &&
    "weeksQuiet" in opened &&
    (opened.weeksQuiet === null ||
      (typeof opened.weeksQuiet === "number" &&
        Number.isInteger(opened.weeksQuiet) &&
        opened.weeksQuiet >= 0))
  )
}

/** The aggregate's schema these modules are read from (`friction.ts`'s `FRICTION_SCHEMA`). */
export const MODULE_OPENS_SCHEMA = "some-ui.friction/2"

/**
 * The modules of a `friction.json` a walkthrough's render kept, or the index
 * of the first that isn't one module's opens (-1: no aggregate at all).
 */
export function readModuleOpens(
  raw: unknown
):
  | { readonly ok: true; readonly modules: ReadonlyArray<ModuleOpens> }
  | { readonly ok: false; readonly at: number } {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("schema" in raw) ||
    raw.schema !== MODULE_OPENS_SCHEMA ||
    !("modules" in raw) ||
    !Array.isArray(raw.modules)
  )
    return { ok: false, at: -1 }
  const modules: ReadonlyArray<unknown> = raw.modules
  const at = modules.findIndex((m) => !isModuleOpens(m))
  return at === -1
    ? { ok: true, modules: modules.filter(isModuleOpens) }
    : { ok: false, at }
}
