/**
 * A conversation essay's record (HOST11, paulgsc/some-ui#3553; epic #3521):
 * the one record that steps 1 to 5 of the owner's model move through, from a
 * topic to the podcast version the owner green-lights, and the input step 6's
 * signature reads. The owner, 2026-11-25: "a video is like a two-step
 * process. You need to decide on what the conversation should be like before
 * we green light it to become a video".
 *
 * 1. **Topic** (`topic`): the owner motivates it in a Claude conversation.
 * 2. **Points** (`point`): the owner's spoken takes, an unordered set, each
 *    by the id home keeps it under.
 * 3. **Podcast vN** (`version`): the agent's turns in order, its retorts and
 *    the segues between the owner's takes. The order and the segues are the
 *    agent's editorial work, never the owner's (the owner: "that is not on
 *    my end. That remains an editorial task by the AI").
 * 4. **Flags** (`flag`, `withdraw`): the owner flags a turn of the newest
 *    version, by a closed set of kinds keyed by whose turn it is, with an
 *    optional note.
 * 5. **Podcast vN+1** (`version`): the agent's next version answers every
 *    open flag, saying how (`ANSWERS_OF`), and may change any turn, since a
 *    flag can ripple through the whole conversation ("covariant", the
 *    owner's word). Back to 4, until the owner green-lights (`green-light`)
 *    a version with no open flag.
 *
 * The family. A turn is the spoken card's turn (`SpokenTurnSchema` in
 * `cut-list.ts`: a line home's Kokoro says, or the owner's take by its id),
 * given an id that lasts across versions so a flag and its answer can name
 * it. The conversation essay is the essay family's member whose turns are
 * not fixed by a template (the call's sections, the Rust essay's tickets) but
 * written and revised by the agent, so what is new here is only the gap: the
 * versions, the flags and the state machine between them.
 *
 * The record is an append-only log of events (`ConversationRecord`), and its
 * state is the log replayed through `stepConversation`, a pure function. A
 * flag never edits a turn, and nothing edits a version: each version, flag and
 * withdrawal stays in the log, and the state keeps every version ever written
 * (CLAUDE.md, "Never lose the record"). Where the log is kept is C1535.
 *
 * The phases and events are closed unions; which events a phase accepts is
 * one table (`CONVERSATION_ACCEPTS`), and a refused event is a closed union too
 * (`ConversationRefusal`). The proof that every order of events keeps the record whole is
 * `__tests__/conversation.test.ts` (CR1).
 */

import { assertNever } from "@some-ui/core-utils"
import { z } from "zod"

import { problemsOf, SpokenTurnSchema } from "./cut-list"
import type { Parsed } from "./cut-list"
import { showId, words } from "./format"

/** The record's schema. */
export const CONVERSATION_RECORD_SCHEMA = "some-ui.conversation/1"

/**
 * How much one conversation holds: policy, moved with the story (C771).
 * Forty turns is about a twenty-minute podcast at thirty seconds a turn,
 * twice the ten minutes the owner named (2026-11-25).
 */
export const CONVERSATION_POLICY = {
  /** The most turns one version has. */
  turnsMost: 40,
  /** The most points (takes) the owner gives one conversation, retakes included. */
  pointsMost: 40,
  /** The most characters a topic, a note or a kept answer's reason runs. */
  noteMost: 600,
} as const

/**
 * The kinds of flag (the owner, 2026-11-25). On the owner's own turns: too
 * quiet, too fast or slow, say it again. On the agent's: not salient,
 * assumes context the listener lacks, unhuman phrasing, off-taste, misses
 * the point. Whose turns each goes on is `FLAG_VOICE`.
 */
export const FLAG_KINDS = [
  "too-quiet",
  "too-fast",
  "too-slow",
  "say-again",
  "not-salient",
  "assumes-context",
  "unhuman",
  "off-taste",
  "misses-point",
] as const

export type FlagKind = (typeof FLAG_KINDS)[number]

/** A turn's voice: the agent's (Kokoro's) line, or the owner's take. */
export type ConversationVoice = z.infer<typeof SpokenTurnSchema>["voice"]

/** The voice whose turns each kind of flag is raised on. */
export const FLAG_VOICE = {
  "too-quiet": "owner",
  "too-fast": "owner",
  "too-slow": "owner",
  "say-again": "owner",
  "not-salient": "kokoro",
  "assumes-context": "kokoro",
  unhuman: "kokoro",
  "off-taste": "kokoro",
  "misses-point": "kokoro",
} as const satisfies Readonly<Record<FlagKind, ConversationVoice>>

/**
 * How a version answers a flag. A version names every turn it changed, by its
 * rewrites and retakes, so a change no flag asked for can't slip in; a
 * rewrite may reach past the flagged turn. `conditioned` plays the same take
 * louder, faster or slower (HOST12's conditioning, #3554); `kept` leaves the
 * flagged turn as it was, and says why.
 */
export const ANSWER_KINDS = [
  "rewrote",
  "retook",
  "conditioned",
  "kept",
] as const
export type AnswerKind = (typeof ANSWER_KINDS)[number]

/** Which answers each kind of flag can take. Every flag can be kept, with a reason. */
export const ANSWERS_OF = {
  "too-quiet": ["conditioned", "retook", "kept"],
  "too-fast": ["conditioned", "retook", "kept"],
  "too-slow": ["conditioned", "retook", "kept"],
  "say-again": ["retook", "kept"],
  "not-salient": ["rewrote", "kept"],
  "assumes-context": ["rewrote", "kept"],
  unhuman: ["rewrote", "kept"],
  "off-taste": ["rewrote", "kept"],
  "misses-point": ["rewrote", "kept"],
} as const satisfies Readonly<Record<FlagKind, ReadonlyArray<AnswerKind>>>

/** A turn's or a flag's id, a name the agent or Studio gives it, which lasts across versions: `k1`, `o3`, `f2`. */
const IdSchema = showId

const NoteSchema = words.max(CONVERSATION_POLICY.noteMost)

const [KokoroTurnSchema, OwnerTurnSchema] = SpokenTurnSchema.options

const TakeSchema = OwnerTurnSchema.shape.take

/**
 * One turn of a version: the spoken card's turn (`SpokenTurnSchema`), a line
 * the agent wrote for Kokoro or a take of the owner's, with its id.
 */
export const ConversationTurnSchema = z.discriminatedUnion("voice", [
  KokoroTurnSchema.extend({ id: IdSchema }),
  OwnerTurnSchema.extend({ id: IdSchema }),
])

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>

/** A flag the owner raised on a turn of the newest version. */
export const ConversationFlagSchema = z.strictObject({
  id: IdSchema,
  turn: IdSchema,
  kind: z.enum(FLAG_KINDS),
  note: NoteSchema.optional(),
})

export type ConversationFlag = z.infer<typeof ConversationFlagSchema>

/** How a version answered one flag of the version before it (`ANSWER_KINDS`). */
export const FlagAnswerSchema = z.discriminatedUnion("how", [
  z.strictObject({
    flag: IdSchema,
    how: z.literal("rewrote"),
    turns: z.array(IdSchema).min(1).max(CONVERSATION_POLICY.turnsMost),
    note: NoteSchema.optional(),
  }),
  z.strictObject({
    flag: IdSchema,
    how: z.literal("retook"),
    take: TakeSchema,
  }),
  z.strictObject({
    flag: IdSchema,
    how: z.literal("conditioned"),
    note: NoteSchema.optional(),
  }),
  z.strictObject({ flag: IdSchema, how: z.literal("kept"), note: NoteSchema }),
])

export type FlagAnswer = z.infer<typeof FlagAnswerSchema>

/** One podcast version: its number from 1, its turns in order, and how it answers the flags on the one before. */
export const PodcastVersionSchema = z.strictObject({
  n: z.number().int().min(1),
  turns: z
    .array(ConversationTurnSchema)
    .min(1)
    .max(CONVERSATION_POLICY.turnsMost),
  answers: z.array(FlagAnswerSchema),
})

export type PodcastVersion = z.infer<typeof PodcastVersionSchema>

/** What the conversation is about, as the owner set it, and the Claude conversation it was set in. */
export const ConversationTopicSchema = z.strictObject({
  said: NoteSchema,
  chat: z.url().optional(),
})

export type ConversationTopic = z.infer<typeof ConversationTopicSchema>

const at = z.iso.datetime()

/** One event of the record, in the order it was kept. */
export const ConversationEventSchema = z.discriminatedUnion("event", [
  z.strictObject({
    event: z.literal("topic"),
    at,
    topic: ConversationTopicSchema,
  }),
  z.strictObject({ event: z.literal("point"), at, take: TakeSchema }),
  z.strictObject({
    event: z.literal("version"),
    at,
    version: PodcastVersionSchema,
  }),
  z.strictObject({
    event: z.literal("flag"),
    at,
    flag: ConversationFlagSchema,
  }),
  z.strictObject({ event: z.literal("withdraw"), at, flag: IdSchema }),
  z.strictObject({
    event: z.literal("green-light"),
    at,
    version: z.number().int().min(1),
  }),
])

export type ConversationEvent = z.infer<typeof ConversationEventSchema>
export type ConversationEventKind = ConversationEvent["event"]

/** The record as kept: its id and its events, oldest first, never rewritten. */
export const ConversationRecordSchema = z.strictObject({
  schema: z.literal(CONVERSATION_RECORD_SCHEMA),
  id: IdSchema,
  events: z.array(ConversationEventSchema),
})

export type ConversationRecord = z.infer<typeof ConversationRecordSchema>

/** A flag as the state keeps it: the version it was raised on, and whether the owner took it back. */
export type KeptFlag = ConversationFlag & {
  readonly version: number
  readonly withdrawn: boolean
}

/** Everything kept once the topic is set; it only grows. */
type Kept = {
  readonly topic: ConversationTopic
  /** The owner's takes, each once. */
  readonly points: ReadonlyArray<string>
  readonly versions: ReadonlyArray<PodcastVersion>
  readonly flags: ReadonlyArray<KeptFlag>
  /** When the newest event was kept: no later event is dated before it. */
  readonly since: string
}

/**
 * Where a conversation stands:
 *
 * - `new`: nothing yet;
 * - `drafting`: the topic is set, the owner gives points, and no version is
 *   written yet;
 * - `podcast`: the newest version waits on the owner, with no open flag;
 * - `flagged`: the newest version has open flags, which the next answers;
 * - `green-lit`: the owner approved a version, and the record is closed.
 */
export type ConversationState =
  | { readonly phase: "new" }
  | ({ readonly phase: "drafting" } & Kept)
  | ({ readonly phase: "podcast" } & Kept)
  | ({ readonly phase: "flagged" } & Kept)
  | ({ readonly phase: "green-lit"; readonly approved: number } & Kept)

export type ConversationPhase = ConversationState["phase"]

/**
 * Which events each phase accepts; every other is refused as out of phase.
 * A new point reaches a version only through a flag (say, `misses-point`
 * with a note), since a version answers flags and changes nothing else.
 */
export const CONVERSATION_ACCEPTS = {
  new: ["topic"],
  drafting: ["point", "version"],
  podcast: ["point", "flag", "green-light"],
  flagged: ["point", "flag", "withdraw", "version"],
  "green-lit": [],
} as const satisfies Readonly<
  Record<ConversationPhase, ReadonlyArray<ConversationEventKind>>
>

/** Why an event was refused. A refused event is never kept. */
export type ConversationRefusal =
  | {
      readonly why: "out-of-phase"
      readonly phase: ConversationPhase
      readonly event: ConversationEventKind
    }
  | { readonly why: "out-of-time"; readonly since: string; readonly at: string }
  | { readonly why: "too-many-points" }
  | { readonly why: "point-again"; readonly take: string }
  | {
      readonly why: "version-number"
      readonly expected: number
      readonly got: number
    }
  | { readonly why: "turn-twice"; readonly turn: string }
  | { readonly why: "take-twice"; readonly take: string }
  | {
      readonly why: "turn-voice"
      readonly turn: string
      readonly voice: ConversationVoice
    }
  | { readonly why: "change-unnamed"; readonly turn: string }
  | {
      readonly why: "take-unknown"
      readonly turn: string
      readonly take: string
    }
  | { readonly why: "unanswered"; readonly flag: string }
  | { readonly why: "answer-unknown"; readonly flag: string }
  | { readonly why: "answer-twice"; readonly flag: string }
  | {
      readonly why: "answer-kind"
      readonly flag: string
      readonly kind: FlagKind
      readonly how: AnswerKind
    }
  | {
      readonly why: "rewrote-unchanged"
      readonly flag: string
      readonly turn: string
    }
  | { readonly why: "retook-unplaced"; readonly flag: string }
  | { readonly why: "conditioned-unplaced"; readonly flag: string }
  | { readonly why: "kept-changed"; readonly flag: string }
  | { readonly why: "flag-again"; readonly flag: string }
  | {
      readonly why: "turn-unknown"
      readonly flag: string
      readonly turn: string
    }
  | {
      readonly why: "flag-voice"
      readonly flag: string
      readonly kind: FlagKind
      readonly voice: ConversationVoice
    }
  | { readonly why: "flag-not-open"; readonly flag: string }
  | {
      readonly why: "green-light-version"
      readonly expected: number
      readonly got: number
    }

export type ConversationStepped =
  | { readonly ok: true; readonly state: ConversationState }
  | { readonly ok: false; readonly refusal: ConversationRefusal }

export const NEW_CONVERSATION: ConversationState = { phase: "new" }

export const latestVersion = (
  state: ConversationState
): PodcastVersion | null =>
  state.phase === "new" ? null : (state.versions.at(-1) ?? null)

/** The flags the next version has to answer: on the newest version, not taken back. */
export function openFlags(state: ConversationState): ReadonlyArray<KeptFlag> {
  const latest = latestVersion(state)
  if (state.phase === "new" || latest === null) return []
  return state.flags.filter((f) => f.version === latest.n && !f.withdrawn)
}

/** The version the owner green-lit, which the signature (step 6) and the render (step 7) read; null until then. */
export const greenLitVersion = (
  state: ConversationState
): PodcastVersion | null =>
  state.phase === "green-lit"
    ? (state.versions.find((v) => v.n === state.approved) ?? null)
    : null

/** The owner's takes a version plays, in order: what HOST12 conditions and HOST13 lays. */
export const ownerTakes = (version: PodcastVersion): ReadonlyArray<string> =>
  version.turns.flatMap((t) => (t.voice === "owner" ? [t.take] : []))

const sameTurn = (a: ConversationTurn, b: ConversationTurn): boolean =>
  a.voice === "kokoro"
    ? b.voice === "kokoro" && a.said === b.said
    : b.voice === "owner" && a.take === b.take

/**
 * The turns that differ between two versions: added, removed, reworded or
 * retaken, or moved (the turn before it is another), in the newer's order
 * and then the removed ones.
 */
export function changedTurns(
  before: PodcastVersion,
  after: PodcastVersion
): ReadonlyArray<string> {
  type Placed = { readonly turn: ConversationTurn; readonly prev?: string }
  const placed = (v: PodcastVersion): Map<string, Placed> =>
    new Map(
      v.turns.map((t, i) => [t.id, { turn: t, prev: v.turns[i - 1]?.id }])
    )
  const was = placed(before)
  const now = placed(after)
  const changed = after.turns.flatMap((t) => {
    const old = was.get(t.id)
    const moved = old !== undefined && old.prev !== now.get(t.id)?.prev
    return old === undefined || !sameTurn(old.turn, t) || moved ? [t.id] : []
  })
  const removed = before.turns.flatMap((t) => (now.has(t.id) ? [] : [t.id]))
  return [...changed, ...removed]
}

/**
 * The first thing wrong with `version`'s turns: an id twice, a take twice or
 * not one of the points, or an id an earlier version gave the other voice.
 */
function turnsRefusal(
  version: PodcastVersion,
  kept: Kept
): ConversationRefusal | null {
  const voiceOf = new Map(
    kept.versions.flatMap((v) => v.turns.map((t) => [t.id, t.voice] as const))
  )
  const ids = new Set<string>()
  const takes = new Set<string>()
  for (const turn of version.turns) {
    if (ids.has(turn.id)) return { why: "turn-twice", turn: turn.id }
    ids.add(turn.id)
    const voice = voiceOf.get(turn.id)
    if (voice !== undefined && voice !== turn.voice)
      return { why: "turn-voice", turn: turn.id, voice }
    if (turn.voice === "owner") {
      if (!kept.points.includes(turn.take))
        return { why: "take-unknown", turn: turn.id, take: turn.take }
      if (takes.has(turn.take)) return { why: "take-twice", take: turn.take }
      takes.add(turn.take)
    }
  }
  return null
}

/** The first thing wrong with how `version` answers the open flags of `before`. */
function answersRefusal(
  version: PodcastVersion,
  before: PodcastVersion | null,
  open: ReadonlyArray<KeptFlag>
): ConversationRefusal | null {
  const byId = new Map(open.map((f) => [f.id, f]))
  const answered = new Set<string>()
  const named = new Set<string>()
  const changed = before === null ? [] : changedTurns(before, version)
  for (const answer of version.answers) {
    const flag = byId.get(answer.flag)
    if (flag === undefined) return { why: "answer-unknown", flag: answer.flag }
    if (answered.has(flag.id)) return { why: "answer-twice", flag: flag.id }
    answered.add(flag.id)
    const allowed: ReadonlyArray<AnswerKind> = ANSWERS_OF[flag.kind]
    if (!allowed.includes(answer.how))
      return {
        why: "answer-kind",
        flag: flag.id,
        kind: flag.kind,
        how: answer.how,
      }
    const placed = version.turns.find((t) => t.id === flag.turn)
    const was = before?.turns.find((t) => t.id === flag.turn)
    switch (answer.how) {
      case "rewrote": {
        const same = answer.turns.find((t) => !changed.includes(t))
        if (same !== undefined)
          return { why: "rewrote-unchanged", flag: flag.id, turn: same }
        for (const turn of answer.turns) named.add(turn)
        break
      }
      case "retook": {
        if (
          placed?.voice !== "owner" ||
          placed.take !== answer.take ||
          (before !== null && ownerTakes(before).includes(answer.take))
        )
          return { why: "retook-unplaced", flag: flag.id }
        named.add(flag.turn)
        break
      }
      case "conditioned": {
        if (
          placed?.voice !== "owner" ||
          was?.voice !== "owner" ||
          placed.take !== was.take
        )
          return { why: "conditioned-unplaced", flag: flag.id }
        break
      }
      case "kept": {
        if (changed.includes(flag.turn))
          return { why: "kept-changed", flag: flag.id }
        break
      }
      default: {
        return assertNever(answer)
      }
    }
  }
  const unanswered = open.find((f) => !answered.has(f.id))
  if (unanswered !== undefined)
    return { why: "unanswered", flag: unanswered.id }
  const unnamed = changed.find((t) => !named.has(t))
  return unnamed === undefined ? null : { why: "change-unnamed", turn: unnamed }
}

/** Kept, with its phase derived from its open flags. */
const reviewing = (kept: Kept): ConversationState => {
  const state: ConversationState = { phase: "podcast", ...kept }
  return openFlags(state).length > 0 ? { ...state, phase: "flagged" } : state
}

/**
 * The state after `event`, or why it is refused. Pure: the same state and
 * event give the same answer, and a refused event changes nothing.
 */
export function stepConversation(
  state: ConversationState,
  event: ConversationEvent
): ConversationStepped {
  const accepted: ReadonlyArray<ConversationEventKind> =
    CONVERSATION_ACCEPTS[state.phase]
  const outOfPhase = refused({
    why: "out-of-phase",
    phase: state.phase,
    event: event.event,
  })
  if (!accepted.includes(event.event)) return outOfPhase
  if (event.event === "topic")
    return ok({
      phase: "drafting",
      topic: event.topic,
      points: [],
      versions: [],
      flags: [],
      since: event.at,
    })
  // `new` accepts only a topic, so this only narrows the type.
  if (state.phase === "new") return outOfPhase
  if (Date.parse(event.at) < Date.parse(state.since))
    return refused({ why: "out-of-time", since: state.since, at: event.at })
  const kept: Kept = {
    topic: state.topic,
    points: state.points,
    versions: state.versions,
    flags: state.flags,
    since: event.at,
  }
  switch (event.event) {
    case "point": {
      if (state.points.includes(event.take))
        return refused({ why: "point-again", take: event.take })
      if (state.points.length >= CONVERSATION_POLICY.pointsMost)
        return refused({ why: "too-many-points" })
      return ok({ ...state, ...kept, points: [...state.points, event.take] })
    }
    case "version": {
      const { version } = event
      const before = latestVersion(state)
      const expected = (before?.n ?? 0) + 1
      if (version.n !== expected)
        return refused({ why: "version-number", expected, got: version.n })
      const wrong =
        turnsRefusal(version, kept) ??
        answersRefusal(version, before, openFlags(state))
      if (wrong !== null) return refused(wrong)
      return ok({
        phase: "podcast",
        ...kept,
        versions: [...state.versions, version],
      })
    }
    case "flag": {
      const { flag } = event
      if (state.flags.some((f) => f.id === flag.id))
        return refused({ why: "flag-again", flag: flag.id })
      const latest = latestVersion(state)
      const turn = latest?.turns.find((t) => t.id === flag.turn)
      if (latest === null || turn === undefined)
        return refused({ why: "turn-unknown", flag: flag.id, turn: flag.turn })
      if (FLAG_VOICE[flag.kind] !== turn.voice)
        return refused({
          why: "flag-voice",
          flag: flag.id,
          kind: flag.kind,
          voice: turn.voice,
        })
      return ok(
        reviewing({
          ...kept,
          flags: [
            ...state.flags,
            { ...flag, version: latest.n, withdrawn: false },
          ],
        })
      )
    }
    case "withdraw": {
      if (!openFlags(state).some((f) => f.id === event.flag))
        return refused({ why: "flag-not-open", flag: event.flag })
      return ok(
        reviewing({
          ...kept,
          flags: state.flags.map((f) =>
            f.id === event.flag ? { ...f, withdrawn: true } : f
          ),
        })
      )
    }
    case "green-light": {
      const expected = latestVersion(state)?.n ?? 0
      if (event.version !== expected)
        return refused({
          why: "green-light-version",
          expected,
          got: event.version,
        })
      return ok({ phase: "green-lit", ...kept, approved: event.version })
    }
    default: {
      return assertNever(event)
    }
  }
}

const ok = (state: ConversationState): ConversationStepped => ({
  ok: true,
  state,
})
const refused = (refusal: ConversationRefusal): ConversationStepped => ({
  ok: false,
  refusal,
})

/** The state `events` leave, from the start, or the first refused event and why. */
export function replayConversation(events: ReadonlyArray<ConversationEvent>):
  | { readonly ok: true; readonly state: ConversationState }
  | {
      readonly ok: false
      readonly at: number
      readonly refusal: ConversationRefusal
    } {
  let state = NEW_CONVERSATION
  for (const [i, event] of events.entries()) {
    const stepped = stepConversation(state, event)
    if (!stepped.ok) return { ok: false, at: i, refusal: stepped.refusal }
    state = stepped.state
  }
  return { ok: true, state }
}

const whose = (voice: ConversationVoice): string =>
  voice === "owner" ? "the owner's" : "the agent's"

/** A refusal as a line for whoever wrote the event: the routine, or a test. */
export function refusalLine(refusal: ConversationRefusal): string {
  switch (refusal.why) {
    case "out-of-phase": {
      return `a ${refusal.event} event can't come while the conversation is ${refusal.phase}`
    }
    case "out-of-time": {
      return `an event dated ${refusal.at} can't follow one dated ${refusal.since}`
    }
    case "take-twice": {
      return `take ${refusal.take} is played twice in the version`
    }
    case "turn-voice": {
      return `turn ${refusal.turn} was ${whose(refusal.voice)} in an earlier version; a turn keeps its voice`
    }
    case "change-unnamed": {
      return `turn ${refusal.turn} changed, and no answer names it`
    }
    case "kept-changed": {
      return `flag ${refusal.flag} is kept, but its turn changed`
    }
    case "too-many-points": {
      return `a conversation takes at most ${CONVERSATION_POLICY.pointsMost} points`
    }
    case "point-again": {
      return `take ${refusal.take} is already a point`
    }
    case "version-number": {
      return `the next version is ${refusal.expected}, not ${refusal.got}`
    }
    case "turn-twice": {
      return `turn ${refusal.turn} is in the version twice`
    }
    case "take-unknown": {
      return `turn ${refusal.turn} plays take ${refusal.take}, which isn't one of the owner's points`
    }
    case "unanswered": {
      return `the version doesn't answer flag ${refusal.flag}`
    }
    case "answer-unknown": {
      return `flag ${refusal.flag} isn't open on the version before`
    }
    case "answer-twice": {
      return `flag ${refusal.flag} is answered twice`
    }
    case "answer-kind": {
      return `a ${refusal.kind} flag can't be answered by ${refusal.how}; it takes ${ANSWERS_OF[refusal.kind].join(", ")}`
    }
    case "rewrote-unchanged": {
      return `flag ${refusal.flag}'s answer names turn ${refusal.turn}, which didn't change`
    }
    case "retook-unplaced": {
      return `flag ${refusal.flag}'s new take isn't played in its turn, or isn't new`
    }
    case "conditioned-unplaced": {
      return `flag ${refusal.flag}'s turn isn't one of the owner's takes in this version`
    }
    case "flag-again": {
      return `flag ${refusal.flag} is already raised`
    }
    case "turn-unknown": {
      return `flag ${refusal.flag} names turn ${refusal.turn}, which isn't in the newest version`
    }
    case "flag-voice": {
      return `a ${refusal.kind} flag is raised on ${whose(FLAG_VOICE[refusal.kind])} turns, and this one is ${whose(refusal.voice)}`
    }
    case "flag-not-open": {
      return `flag ${refusal.flag} isn't open`
    }
    case "green-light-version": {
      return `only the newest version, ${refusal.expected}, can be green-lit, not ${refusal.got}`
    }
    default: {
      return assertNever(refusal)
    }
  }
}

/** A kept record, read and replayed: its state, or every reason it can't be read. */
export function parseConversationRecord(raw: unknown): Parsed<{
  readonly record: ConversationRecord
  readonly state: ConversationState
}> {
  const parsed = ConversationRecordSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, problems: problemsOf(parsed.error, "conversation") }
  const replayed = replayConversation(parsed.data.events)
  return replayed.ok
    ? { ok: true, value: { record: parsed.data, state: replayed.state } }
    : {
        ok: false,
        problems: [`events.${replayed.at}: ${refusalLine(replayed.refusal)}`],
      }
}
