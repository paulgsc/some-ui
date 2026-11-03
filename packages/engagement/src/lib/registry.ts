/**
 * The registry (ENG1): every pipeline, what it is about, and what it puts in
 * front of the owner on each surface, each with an id that stays stable.
 *
 * - A **pipeline** is one thing the owner comes back to (TOPIK, Rust Rounds,
 *   Studio's video, aph): its wing (`apps/www/src/lib/wings`) and its
 *   domain. A domain is what accumulates by coming back (Korean, Rust, the
 *   videos), so two pipelines can share one: TOPIK and Hangul Honeycomb are
 *   both Korean.
 * - An **affordance** is one thing a pipeline offers on one surface: its id
 *   (unique in its pipeline on that surface; the same id on the other
 *   surface means the same thing there), its name in the owner's words, the
 *   routes it is offered and taken on, how it is offered, the events it can
 *   emit, and, where it emits them, its places (`left`) and answers (`said`).
 * - **Touching the domain** is taking an affordance whose `touches` is true.
 *   The reading (ENG11) computes "last Korean 2 days ago" from those.
 *
 * **An id is forever.** Events name affordances by id and are kept for good
 * ("Never lose the record", CLAUDE.md), so an id is never renamed or
 * reused: a changed affordance keeps its id, a new one gets a new id, and a
 * retired one stays listed with `retired: true`. Names, routes and places can
 * change; a place or an answer id cannot.
 *
 * `findRegistryProblems` holds the shapes. Which routes every wing's rooms
 * have, and that each is placed here, is `apps/www/src/routes/__tests__/
 * engagement.test.ts`'s, since only www has the route tree.
 */
import type { EventKind, Surface } from "@engagement/lib/events"

/** The wings of `apps/www/src/lib/wings` that hold a pipeline. */
export type WingId = "practice" | "self" | "studio" | "jobs" | "operate"

/** What accumulates by coming back. */
export type DomainId =
  | "practice"
  | "korean"
  | "rust"
  | "algorithms"
  | "reflection"
  | "video"
  | "jobs"
  | "aph"
  | "lessons"
  | "resume"

/** What counts as the offer: shown on a list, served by a menu, sent as a notification. */
export type OfferHow = "listed" | "served" | "notified"

/** A place a `left` can name, or an answer a `said` can carry: an id and its words. */
export type Choice = { readonly id: string; readonly name: string }

export type Affordance = {
  /** Stable for good: lowercase words joined by hyphens. */
  readonly id: string
  readonly surface: Surface
  /** What the owner calls it, as the reading will say it. */
  readonly name: string
  /**
   * The routes it is offered or taken on, as a link names them. Empty for
   * one that lives in no page of its own (a notification).
   */
  readonly routes: ReadonlyArray<string>
  /** How it is put in front of the owner; null when it never is (they go to it). */
  readonly offer: OfferHow | null
  readonly emits: ReadonlyArray<EventKind>
  /** Whether taking it is touching its pipeline's domain. */
  readonly touches: boolean
  /** Where a `left` can say it stopped. */
  readonly places?: ReadonlyArray<Choice>
  /** What a `said` can answer. */
  readonly answers?: ReadonlyArray<Choice>
  /** No longer offered; kept so the events that name it still read. */
  readonly retired?: true
}

export type Pipeline = {
  /** Stable for good: lowercase words joined by hyphens. */
  readonly id: string
  readonly name: string
  readonly wing: WingId
  readonly domain: DomainId
  readonly affordances: ReadonlyArray<Affordance>
}

/** A route in a wing that offers nothing, and why. */
export type Unmeasured = { readonly route: string; readonly why: string }

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Every way the registry breaks its own shape, as `pipeline/affordance`
 * plus what is wrong; empty when it holds:
 *
 * - ids are lowercase words joined by hyphens, a pipeline's once, an
 *   affordance's once per pipeline and surface, a place's or an answer's
 *   once per affordance;
 * - `offered` is emitted exactly when there is an offer, and `passed-over`
 *   only with `offered`;
 * - `left` is emitted exactly when there are places, and only with `taken`;
 * - `said` is emitted exactly when there are answers;
 * - every pipeline has an affordance that is not retired.
 */
export function findRegistryProblems(
  pipelines: ReadonlyArray<Pipeline>,
  unmeasured: ReadonlyArray<Unmeasured>
): ReadonlyArray<string> {
  const problems: Array<string> = []
  const pipelineIds = new Set<string>()
  for (const pipeline of pipelines) {
    const at = pipeline.id
    if (!ID.test(pipeline.id))
      problems.push(`${at}: an id is lowercase words joined by hyphens`)
    if (pipelineIds.has(pipeline.id)) problems.push(`${at}: listed twice`)
    pipelineIds.add(pipeline.id)
    if (pipeline.affordances.every((a) => a.retired === true))
      problems.push(`${at}: offers nothing that is not retired`)

    const keys = new Set<string>()
    for (const a of pipeline.affordances) {
      const here = `${at}/${a.id} (${a.surface})`
      if (!ID.test(a.id))
        problems.push(`${here}: an id is lowercase words joined by hyphens`)
      const key = `${a.surface}:${a.id}`
      if (keys.has(key)) problems.push(`${here}: listed twice on its surface`)
      keys.add(key)
      problems.push(...affordanceProblems(here, a))
    }
  }
  const routes = new Set<string>()
  for (const { route, why } of unmeasured) {
    if (routes.has(route)) problems.push(`${route}: unmeasured twice`)
    routes.add(route)
    if (why.trim() === "") problems.push(`${route}: says why it is unmeasured`)
    for (const pipeline of pipelines)
      for (const a of pipeline.affordances)
        if (a.routes.includes(route))
          problems.push(
            `${route}: unmeasured, yet ${pipeline.id}/${a.id} is offered there`
          )
  }
  return problems
}

function affordanceProblems(here: string, a: Affordance): Array<string> {
  const problems: Array<string> = []
  const emits = new Set(a.emits)
  if (a.emits.length === 0) problems.push(`${here}: emits nothing`)
  if (emits.size !== a.emits.length) problems.push(`${here}: an event twice`)
  if (emits.has("offered") !== (a.offer !== null))
    problems.push(`${here}: emits offered exactly when it has an offer`)
  if (emits.has("passed-over") && !emits.has("offered"))
    problems.push(`${here}: only an offer can be passed over`)
  const places = a.places ?? []
  const answers = a.answers ?? []
  if (emits.has("left") !== places.length > 0)
    problems.push(`${here}: emits left exactly when it names places`)
  if (emits.has("left") && !emits.has("taken"))
    problems.push(`${here}: only what was taken can be left`)
  if (emits.has("said") !== answers.length > 0)
    problems.push(`${here}: emits said exactly when it names answers`)
  for (const [what, list] of [
    ["place", places],
    ["answer", answers],
  ] as const) {
    const ids = new Set<string>()
    for (const choice of list) {
      if (!ID.test(choice.id))
        problems.push(`${here}: ${what} ${choice.id} is not lowercase words`)
      if (ids.has(choice.id))
        problems.push(`${here}: ${what} ${choice.id} twice`)
      ids.add(choice.id)
    }
  }
  if (a.name.trim() === "") problems.push(`${here}: has no name`)
  return problems
}

/** The affordance an event names, or undefined. */
export function findAffordance(
  pipelines: ReadonlyArray<Pipeline>,
  pipeline: string,
  affordance: string,
  surface: Surface
): Affordance | undefined {
  return pipelines
    .find((p) => p.id === pipeline)
    ?.affordances.find((a) => a.id === affordance && a.surface === surface)
}
