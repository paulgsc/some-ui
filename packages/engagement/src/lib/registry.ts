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
import { ELSEWHERE } from "@engagement/lib/events"

/** The wings of `apps/www/src/lib/wings` that hold a pipeline. */
export type WingId =
  | "practice"
  | "self"
  | "studio"
  | "jobs"
  | "cast"
  | "operate"

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
  /**
   * For an affordance that is a flow, what leaving one of its places for
   * another screen means: it ended there (`finishedAt`), or was left
   * part-way (`partWayAt`). A place in neither says neither.
   */
  readonly flow?: {
    readonly finishedAt: ReadonlyArray<string>
    readonly partWayAt: ReadonlyArray<string>
  }
  /** What a `said` can answer. */
  readonly answers?: ReadonlyArray<Choice>
  /** No longer offered; kept so the events that name it still read. */
  readonly retired?: true
}

/**
 * How a read knows a module was opened on a day (silence, #3338; C861): by
 * an affordance its root sends an event for on every show (`offered` or
 * `taken`), or not at all. A module whose root sends nothing reads "not
 * measured", never "silent", so no live module is called a graveyard.
 */
export type Opened =
  | { readonly kind: "root"; readonly affordance: string }
  | { readonly kind: "not-measured"; readonly why: string }

export type Pipeline = {
  /** Stable for good: lowercase words joined by hyphens. */
  readonly id: string
  readonly name: string
  readonly wing: WingId
  readonly domain: DomainId
  /** How its opening is known (`Opened`). */
  readonly opened: Opened
  readonly affordances: ReadonlyArray<Affordance>
}

/** A route in a wing that offers nothing, and why. */
export type Unmeasured = { readonly route: string; readonly why: string }

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Every way `pipeline.opened` fails to say truly how its opening is known. */
function openedProblems(pipeline: Pipeline): ReadonlyArray<string> {
  const { opened } = pipeline
  switch (opened.kind) {
    case "root": {
      const root = pipeline.affordances.find(
        (a) => a.id === opened.affordance && a.retired !== true
      )
      if (root === undefined) {
        return [
          `${pipeline.id}: opened at ${opened.affordance}, which it doesn't offer`,
        ]
      }
      return root.emits.includes("offered") || root.emits.includes("taken")
        ? []
        : [`${pipeline.id}: its root ${root.id} sends nothing when shown`]
    }
    case "not-measured": {
      return opened.why.trim() === ""
        ? [`${pipeline.id}: says why its opening is not measured`]
        : []
    }
    default: {
      const none: never = opened
      throw new Error(`no such opening: ${JSON.stringify(none)}`)
    }
  }
}

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
 * - a flow names only its own places, each once, and none is `elsewhere`;
 * - every pipeline has an affordance that is not retired;
 * - a pipeline opened at its root names one of its own affordances, not
 *   retired, that sends `offered` or `taken`; one not measured says why.
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
    problems.push(...openedProblems(pipeline))

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
  if (places.some((p) => p.id === ELSEWHERE))
    problems.push(
      `${here}: no place is ${ELSEWHERE}, which a left's next keeps`
    )
  if (a.flow !== undefined) {
    const named = [...a.flow.finishedAt, ...a.flow.partWayAt]
    if (named.length === 0) problems.push(`${here}: a flow names a place`)
    if (new Set(named).size !== named.length)
      problems.push(`${here}: a flow names a place once`)
    for (const id of named)
      if (!places.some((p) => p.id === id))
        problems.push(`${here}: flow place ${id} is not one of its places`)
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
