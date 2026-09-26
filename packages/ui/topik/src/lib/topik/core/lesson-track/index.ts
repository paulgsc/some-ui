/**
 * The handheld lesson: a pure plan and reducer.
 *
 * This is the step logic behind the handheld renderer, and it is not the desktop
 * session squeezed. The desktop session plays a whole conversation and then
 * quizzes it as a batch; on a small screen that quiz is answered with the
 * transcript scrolled out of view, which silently turns an open-book exercise
 * into a closed-book one (adaptive-learning canon Prop. 9.4). Rather than
 * reflow that, this module delivers a *declared* valuation (Cor. 4.4, as
 * amended by Cor. 4.5):
 *
 * - the pacing unit is the line, not the batch (Rem. 4.3, extended);
 * - each line climbs a progressive hint ladder: audio -> Hangul -> gloss;
 * - a check follows the line it is about, and that line's gloss stays hidden
 *   until the check is answered;
 * - every check is a morphism probe (Def. 4.6) - is this the past tense, which
 *   reply fits, build the negation - never a first-order "what does it mean?",
 *   which a single recognised noun can answer (Prop. 4.2). A conversation with
 *   no probes is a listening lesson; its legacy `questions` are the desktop's;
 * - a missed check comes back once after the last line, instead of the whole
 *   batch replaying (the policy of maximal ignorance, Rem. 4.3);
 * - there is no pass/fail and nothing is credited: the tally is for the
 *   learner, not for a belief that does not exist yet (O3).
 *
 * Framework-agnostic like the rest of `core/`: no React, no I/O. The plan is
 * derived from content on demand rather than stored, so the state stays a
 * handful of indexes.
 */

import type { ConversationBatch, Message, Probe } from "@topik/lib/topik"
import {
  hashSeed,
  MAX_TILES,
  tokenize,
} from "@topik/lib/topik/core/tile-assembly"
import { assertNever } from "some-ui-utils"

// ═══════════════════════════════════════════════════════════════════════════
// PLAN
// ═══════════════════════════════════════════════════════════════════════════

/** How much of a line is showing: 0 audio only, 1 Hangul, 2 gloss too. */
export type RevealLevel = 0 | 1 | 2

export type LineStep = {
  kind: "line"
  /** Index into the conversation's messages. */
  message: number
  /** Checks anchored to this line. While any are pending the gloss is withheld. */
  checks: number
}

export type CheckStep = {
  kind: "check"
  /** Index into the conversation's `probes`. */
  probe: number
  /** The probe's authored id: what first tries and reviews are keyed by. */
  id: string
  /** Which version of the probe this is (`probeFingerprint`). */
  fingerprint: string
  /** The message index the check is about. */
  anchor: number
  /** True for the once-only re-presentation of a missed check. */
  repeat: boolean
}

export type WrapStep = { kind: "wrap" }

export type LessonStep = LineStep | CheckStep | WrapStep

/** The steps a conversation always has: lines, each followed by its checks. */
export type LessonPlan = {
  steps: Array<LineStep | CheckStep>
  lineCount: number
  checkCount: number
}

const collapse = (text: string): string => text.replace(/\s+/g, "").trim()

/**
 * Which line an item is about.
 *
 * Content may say so (`anchorMessageId`, an authoring-time field). Otherwise the
 * first line whose Korean contains the item's Korean excerpt, or is contained
 * by it, is taken. Failing both, the last line: the item is then asked once
 * the whole conversation has been heard.
 *
 * Anchoring is pacing, not belief (canon Cor. 4.4 (ii)), which is why a
 * heuristic is admissible here at all.
 */
export function anchorOf(
  item: { anchorMessageId?: string; excerpt?: string },
  messages: Array<Message>
): number {
  if (messages.length === 0) return -1

  if (item.anchorMessageId !== undefined) {
    const declared = messages.findIndex(
      (message) => message.id === item.anchorMessageId
    )
    if (declared !== -1) return declared
  }

  const excerpt = collapse(item.excerpt ?? "")
  if (excerpt.length > 0) {
    const matched = messages.findIndex((message) => {
      const line = collapse(message.korean || message.content)
      return (
        line.length > 0 && (line.includes(excerpt) || excerpt.includes(line))
      )
    })
    if (matched !== -1) return matched
  }

  return messages.length - 1
}

/**
 * Whether a probe can be put to a learner on this surface. A build probe needs
 * a board a thumb can work (canon Def. 4.5); one whose target cannot be tiled
 * is left out rather than asked some other way, since asking it as a
 * selection would be a different exercise than the one authored.
 */
export function isDeliverable(probe: Probe): boolean {
  if (probe.kind !== "build") return true
  const split = tokenize(probe.acceptedAnswers?.[0] ?? probe.target)
  return split !== null && split.tokens.length <= MAX_TILES
}

export function planConversation(batch: ConversationBatch): LessonPlan {
  const { messages } = batch
  const probes = batch.probes ?? []
  const byAnchor = new Map<
    number,
    Array<{ probe: number; id: string; fingerprint: string }>
  >()
  const seen = new Set<string>()

  probes.forEach((probe, index) => {
    // An id is identity (Thm. 1.1): a duplicate would share a first try, so
    // only the first probe to claim it is delivered.
    if (seen.has(probe.id) || !isDeliverable(probe)) return
    seen.add(probe.id)
    const anchor = anchorOf(
      { anchorMessageId: probe.anchorMessageId, excerpt: probe.source },
      messages
    )
    if (anchor === -1) return
    const bucket = byAnchor.get(anchor) ?? []
    bucket.push({
      probe: index,
      id: probe.id,
      fingerprint: probeFingerprint(probe),
    })
    byAnchor.set(anchor, bucket)
  })

  const steps: Array<LineStep | CheckStep> = []
  let checkCount = 0
  messages.forEach((_, message) => {
    const anchored = byAnchor.get(message) ?? []
    steps.push({ kind: "line", message, checks: anchored.length })
    for (const { probe, id, fingerprint } of anchored) {
      steps.push({
        kind: "check",
        probe,
        id,
        fingerprint,
        anchor: message,
        repeat: false,
      })
      checkCount += 1
    }
  })

  return { steps, lineCount: messages.length, checkCount }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

export type ResponseChannel = "selection" | "assembly"

export type CheckOutcome = {
  correct: boolean
  response: string
  /** Def. 4.5 / Rem. 4.6: an assembly outcome is never folded as free text. */
  channel: ResponseChannel
  /** The highest rung the anchor line reached before this check was answered. */
  anchorReveal: RevealLevel
}

export type LessonState = {
  /** Conversation (batch) index. */
  conversation: number
  /** Index into `stepsOf(plan, state)`. */
  step: number
  /** Rung of the current line; meaningless on other steps. */
  reveal: RevealLevel
  /** Highest rung reached per line of this conversation, by message index. */
  heard: Record<number, RevealLevel>
  /** The outcome for the current check, once answered. */
  answered: CheckOutcome | null
  /** First-presentation outcome per check id, this conversation. */
  firstTry: Record<string, boolean>
  /** Ids of missed checks, re-presented once after the last line. */
  review: Array<string>
  /** Ids of repeats already answered: once-only means once, across reloads. */
  reviewed: Array<string>
  /** Set when the last conversation's wrap has been left. */
  finished: boolean
}

export type LessonContext = {
  plan: LessonPlan
  conversationCount: number
  /**
   * Whether the renderer can speak. Without audio the ladder starts at Hangul:
   * a rung the renderer cannot realise is outside its capability set
   * (canon Def. 9.3).
   */
  audio: boolean
}

export type LessonEvent =
  | { type: "REVEAL" }
  | { type: "NEXT" }
  | { type: "PREV" }
  | {
      type: "ANSWER"
      correct: boolean
      response: string
      channel: ResponseChannel
    }
  | { type: "NEXT_CONVERSATION" }
  | { type: "RESTART_CONVERSATION" }
  /** Jump to a conversation's line, e.g. restoring a resume point. */
  | {
      type: "RESUME"
      conversation: number
      message: number
      /** The conversation's results so far, as `outcomesOf` wrote them. */
      outcomes?: LessonOutcomes
    }

/** A conversation's check results in a storable form. */
export type LessonOutcomes = {
  firstTry: Record<string, boolean>
  review: Array<string>
  /** Optional: outcomes written before repeats were tracked still restore. */
  reviewed?: Array<string>
}

export const startReveal = (audio: boolean): RevealLevel => (audio ? 0 : 1)

export function createLessonState(
  audio: boolean,
  conversation = 0
): LessonState {
  return {
    conversation,
    step: 0,
    reveal: startReveal(audio),
    heard: {},
    answered: null,
    firstTry: {},
    review: [],
    reviewed: [],
    finished: false,
  }
}

/** Every step of the current conversation, including review and wrap. */
export function stepsOf(
  plan: LessonPlan,
  state: Pick<LessonState, "review">
): Array<LessonStep> {
  const review = state.review.flatMap((id): Array<CheckStep> => {
    const original = plan.steps.find(
      (step): step is CheckStep => step.kind === "check" && step.id === id
    )
    return original ? [{ ...original, repeat: true }] : []
  })
  return [...plan.steps, ...review, { kind: "wrap" }]
}

export function currentStep(
  plan: LessonPlan,
  state: LessonState
): LessonStep | undefined {
  return stepsOf(plan, state)[state.step]
}

/**
 * The highest rung a line may reach right now: the gloss waits for the line's
 * checks, so a comprehension check is never answered off its own translation.
 */
export function revealCap(
  plan: LessonPlan,
  state: LessonState,
  line: LineStep
): RevealLevel {
  return glossUnlocked(plan, state, line.message) ? 2 : 1
}

/**
 * Whether a line's gloss may show: once every check anchored to it has had
 * its first presentation. The one rule behind both the line's reveal cap and
 * the check feedback's echo of the line, so neither can show the translation
 * while a sibling check on the same line is still to come.
 */
export function glossUnlocked(
  plan: LessonPlan,
  state: Pick<LessonState, "firstTry">,
  message: number
): boolean {
  return plan.steps.every(
    (step) =>
      step.kind !== "check" ||
      step.anchor !== message ||
      step.id in state.firstTry
  )
}

/** The key a check's results are recorded under: its probe's authored id. */
export const checkKey = (step: CheckStep): string => step.id

/**
 * What a probe asks and what counts as right, as a short hash. An authored id
 * says which item this is; it cannot say the item was not edited since. A
 * stored result is only restored onto a probe with the same fingerprint, so a
 * probe whose candidates, validity or target changed under an unchanged id
 * starts fresh (Thm. 1.1). Wording that grades nothing - `why`, `label`,
 * `explanation` - is left out, so a copy edit keeps a learner's result.
 */
export function probeFingerprint(probe: Probe): string {
  const graded =
    probe.kind === "build"
      ? [probe.relation, probe.target, probe.acceptedAnswers ?? null]
      : probe.options.map((option) => [
          option.text,
          option.relation,
          option.valid,
        ])
  const content = JSON.stringify([
    probe.kind,
    probe.source ?? null,
    probe.prompt,
    graded,
  ])
  return hashSeed(content).toString(36)
}

/** A result's persisted key: which probe, and which version of it. */
const persistedKey = (id: string, fingerprint: string): string =>
  `${id}@${fingerprint}`

function persistedKeys(plan: LessonPlan): Map<string, string> {
  const keys = new Map<string, string>()
  for (const step of plan.steps) {
    if (step.kind === "check") {
      keys.set(checkKey(step), persistedKey(step.id, step.fingerprint))
    }
  }
  return keys
}

/** The current conversation's results, ready to persist. */
export function outcomesOf(
  state: LessonState,
  plan: LessonPlan
): LessonOutcomes {
  const keys = persistedKeys(plan)
  const persist = (id: string): Array<string> => {
    const key = keys.get(id)
    return key === undefined ? [] : [key]
  }
  return {
    firstTry: Object.fromEntries(
      Object.entries(state.firstTry).flatMap(([id, correct]) =>
        persist(id).map((key) => [key, correct])
      )
    ),
    review: state.review.flatMap(persist),
    reviewed: state.reviewed.flatMap(persist),
  }
}

/**
 * Stored results, kept only for probes this plan still has, at the version it
 * has them: an id the content no longer carries, or one whose probe changed,
 * is an orphan (Thm. 1.1). A review entry without a recorded miss is not a
 * promise anyone made, and a completed repeat is only one that was promised.
 */
function restoreOutcomes(
  plan: LessonPlan,
  outcomes: LessonOutcomes
): Pick<LessonState, "firstTry" | "review" | "reviewed"> {
  const byKey = new Map<string, string>()
  for (const [id, key] of persistedKeys(plan)) byKey.set(key, id)
  const idOf = (key: string): Array<string> => {
    const id = byKey.get(key)
    return id === undefined ? [] : [id]
  }
  const firstTry = Object.fromEntries(
    Object.entries(outcomes.firstTry).flatMap(([key, correct]) =>
      idOf(key).map((id) => [id, correct])
    )
  )
  const review = [...new Set(outcomes.review.flatMap(idOf))].filter(
    (id) => firstTry[id] === false
  )
  const reviewed = [...new Set((outcomes.reviewed ?? []).flatMap(idOf))].filter(
    (id) => review.includes(id)
  )
  return { firstTry, review, reviewed }
}

/** Position of a message's line step, or -1. */
export function lineStepIndex(plan: LessonPlan, message: number): number {
  return plan.steps.findIndex(
    (step) => step.kind === "line" && step.message === message
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// REDUCER
// ═══════════════════════════════════════════════════════════════════════════

const max = (a: RevealLevel, b: RevealLevel | undefined): RevealLevel =>
  b === undefined || a >= b ? a : b

/** Leave the current step for `step`, carrying the line's rung into `heard`. */
function moveTo(
  plan: LessonPlan,
  state: LessonState,
  step: number,
  ctx: LessonContext
): LessonState {
  const leaving = currentStep(plan, state)
  const heard =
    leaving?.kind === "line"
      ? {
          ...state.heard,
          [leaving.message]: max(state.reveal, state.heard[leaving.message]),
        }
      : state.heard

  const arriving = stepsOf(plan, state)[step]
  const reveal =
    arriving?.kind === "line"
      ? // A line already climbed returns at its old rung; a new one starts over.
        (heard[arriving.message] ?? startReveal(ctx.audio))
      : state.reveal

  return { ...state, step, heard, reveal, answered: null }
}

export function lessonReducer(
  state: LessonState,
  event: LessonEvent,
  ctx: LessonContext
): LessonState {
  const { plan } = ctx
  const steps = stepsOf(plan, state)
  const step = steps[state.step]

  switch (event.type) {
    case "REVEAL": {
      if (step?.kind !== "line") return state
      const cap = revealCap(plan, state, step)
      if (state.reveal >= cap) return state
      return { ...state, reveal: state.reveal === 0 ? 1 : 2 }
    }

    case "NEXT": {
      if (!step || step.kind === "wrap") return state
      // A check is left only once answered: skipping it would make the tally
      // a count of the checks the learner chose to take.
      if (step.kind === "check" && state.answered === null) return state
      // A check already answered - reached again by stepping back to its
      // line, or by a reload - is passed over, not re-asked: a second answer
      // would overwrite the first try, queue a second review, or serve a
      // once-only repeat twice.
      const alreadyAsked = (ahead: LessonStep | undefined): boolean =>
        ahead?.kind === "check" &&
        (ahead.repeat
          ? state.reviewed.includes(ahead.id)
          : ahead.id in state.firstTry)
      let next = state.step + 1
      while (alreadyAsked(steps[next])) next += 1
      return moveTo(plan, state, next, ctx)
    }

    case "PREV": {
      // Only between lines. Stepping back from an unanswered check would put
      // its answer's source on screen - a hint the valuation does not declare.
      if (step?.kind !== "line") return state
      for (let index = state.step - 1; index >= 0; index -= 1) {
        if (steps[index]?.kind === "line") {
          return moveTo(plan, state, index, ctx)
        }
      }
      return state
    }

    case "ANSWER": {
      if (step?.kind !== "check" || state.answered !== null) return state
      // The first try is recorded once; nothing here may rewrite it.
      if (
        step.repeat
          ? state.reviewed.includes(step.id)
          : step.id in state.firstTry
      )
        return state
      const answered: CheckOutcome = {
        correct: event.correct,
        response: event.response,
        channel: event.channel,
        anchorReveal: state.heard[step.anchor] ?? startReveal(ctx.audio),
      }
      if (step.repeat) {
        return { ...state, answered, reviewed: [...state.reviewed, step.id] }
      }
      return {
        ...state,
        answered,
        firstTry: { ...state.firstTry, [step.id]: event.correct },
        review: event.correct ? state.review : [...state.review, step.id],
      }
    }

    case "NEXT_CONVERSATION": {
      if (step?.kind !== "wrap") return state
      const next = state.conversation + 1
      if (next >= ctx.conversationCount) return { ...state, finished: true }
      return createLessonState(ctx.audio, next)
    }

    case "RESTART_CONVERSATION": {
      return createLessonState(ctx.audio, state.conversation)
    }

    case "RESUME": {
      if (event.conversation < 0 || event.conversation >= ctx.conversationCount)
        return state
      const fresh = createLessonState(ctx.audio, event.conversation)
      // `ctx.plan` must already describe `event.conversation`; the caller
      // switches plans before resuming into another conversation.
      const index = lineStepIndex(plan, event.message)
      // Unresolvable line: the conversation's start, and its results with it
      // - a score sheet for a position we cannot find is not trustworthy.
      if (index === -1) return fresh
      return {
        ...fresh,
        ...(event.outcomes ? restoreOutcomes(plan, event.outcomes) : {}),
        step: index,
      }
    }

    default: {
      return assertNever(event)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DERIVED VIEW
// ═══════════════════════════════════════════════════════════════════════════

export type LessonTally = {
  /** Checks answered correctly on first presentation. */
  firstTry: number
  /** Checks answered so far (first presentation). */
  answered: number
  /** Checks in the conversation. */
  total: number
  /** Checks re-presented after a miss. */
  revisited: number
}

export function tallyOf(plan: LessonPlan, state: LessonState): LessonTally {
  const outcomes = Object.values(state.firstTry)
  return {
    firstTry: outcomes.filter(Boolean).length,
    answered: outcomes.length,
    total: plan.checkCount,
    revisited: state.review.length,
  }
}

/** 0..1 through the current conversation, wrap excluded. */
export function progressOf(plan: LessonPlan, state: LessonState): number {
  const total = stepsOf(plan, state).length - 1
  if (total <= 0) return 1
  return Math.min(state.step / total, 1)
}
