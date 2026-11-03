/**
 * Answering Claude's questions about an idea (STUDIO ST19), as one state
 * machine: one question per screen, each a turn (`@some-ui/voice-capture`'s
 * `stepTurn`, TALK1): the words appearing as they're spoken (or once home
 * has heard the take, `./hearing`), then That's right, Fix the words or Say
 * it again, and the reply is the next question. A new idea is caught as one
 * bundle instead (ST26, `./bundle`).
 * `step(state, event)` returns the next state and the effects to run and
 * does nothing else; `runtime.ts` runs them against the listener (home
 * hearing a take, or the phone's recognizer) and the idea store, and the
 * component renders a state and turns taps into events
 * (docs/monorepo-boundaries.md, "Inside a React package").
 *
 * Rules that hold by structure, beside the turn's own (only confirmed
 * words are kept, a fix beside the words first heard; speaking never waits
 * on voice; one listening at a time):
 *
 * - **Each answer is kept the moment it is confirmed**, so a call, a locked
 *   screen or a closed app loses at most the answer being spoken.
 * - **Each question that opens while it can't listen asks again** whether
 *   it can, so "Say it" comes back once it can (IH1, `./hearing`).
 * - **A write is a change, never a copy.** `keep` hands the store an
 *   operation it applies to the ideas it holds (`apply`), and the screen's
 *   idea is only ever the store's answer.
 * - **Claude's questions are answered only when asked for** (ST19). The
 *   capture is opened on one idea (its id, from the idea shelf) and asks
 *   only Claude's questions about it still waiting, one per screen, or,
 *   with none waiting, the first one skipped. One skipped waits on nothing
 *   and is answered later.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  ListeningEffect,
  TurnEvent,
  TurnIntent,
  TurnState,
  TurnStep,
} from "@some-ui/voice-capture"
import {
  initialTurn,
  isUnderway,
  nextTurn,
  stepTurn,
} from "@some-ui/voice-capture"

import type { AnswerTo, AnswerWords, Idea } from "./model"
import {
  IDEA_QUESTIONS,
  isFollowUp,
  openFollowUp,
  skippedAsks,
  withPassed,
  withWords,
} from "./model"

type IdeaScreen =
  | { readonly kind: "loading" }
  | { readonly kind: "unreadable" }
  /** A question, asked as a turn (`IdeaState.turn`). */
  | { readonly kind: "ask"; readonly question: AnswerTo }
  | { readonly kind: "kept" }

export type IdeaState = {
  readonly screen: IdeaScreen
  /** The question's turn; what can listen, and the listenings' count, carry over. */
  readonly turn: TurnState
  /** The idea as the store last kept it; null until its first answer. */
  readonly idea: Idea | null
  /** The idea whose questions from Claude are asked, by id. */
  readonly ideaId: string
}

/** What a write does to the ideas the store holds now. */
export type IdeaOp =
  | {
      readonly kind: "words"
      readonly idea: string
      readonly question: AnswerTo
      readonly versions: ReadonlyArray<AnswerWords>
    }
  | {
      readonly kind: "pass"
      readonly idea: string
      readonly question: AnswerTo
    }

/** Taps, as the component sends them: a turn's, and the idea's own. */
export type IdeaIntent =
  | TurnIntent
  | { readonly type: "skip" }
  | { readonly type: "answerSkipped" }
  | { readonly type: "readAgain" }

type Stamp = { readonly at: string }

export type IdeaEvent =
  | (IdeaIntent & Stamp)
  | ({ readonly type: "entered" } & Stamp)
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | {
      readonly type: "listed"
      /** Null when the kept ideas couldn't be read. */
      readonly ideas: ReadonlyArray<Idea> | null
    }
  | Extract<
      TurnEvent,
      { type: "voiceChecked" | "ready" | "hearing" | "partial" | "listened" }
    >
  | {
      readonly type: "kept"
      /** The ideas as kept, or null when nothing was. */
      readonly ideas: ReadonlyArray<Idea> | null
    }

export type IdeaEffect =
  | { readonly type: "read" }
  | ListeningEffect
  | { readonly type: "keep"; readonly op: IdeaOp; readonly at: string }

export type IdeaStep = {
  readonly state: IdeaState
  readonly effects: ReadonlyArray<IdeaEffect>
}

/** `ideaId`: the idea whose questions from Claude are asked. */
export function initialIdeaState(ideaId: string): IdeaState {
  return {
    screen: { kind: "loading" },
    turn: initialTurn,
    idea: null,
    ideaId,
  }
}

/**
 * What a take of `question` answers, as the take is kept and told home
 * (`idea:<idea>:<question>`, a Studio note's `ref`).
 */
function takeAnswers(ideaId: string, question: AnswerTo): string {
  return `idea:${ideaId}:${question}`
}

/**
 * The ideas with `op` applied, for the store to keep; unchanged when the
 * op names an idea the store doesn't hold.
 */
export function apply(
  ideas: ReadonlyArray<Idea>,
  op: IdeaOp
): ReadonlyArray<Idea> {
  const held = ideas.find((idea) => idea.id === op.idea)
  if (held === undefined) return ideas
  const changed =
    op.kind === "words"
      ? withWords(held, op.question, op.versions)
      : withPassed(held, op.question)
  return ideas.map((idea) => (idea === held ? changed : idea))
}

const same = (state: IdeaState): IdeaStep => ({ state, effects: [] })

/**
 * The idea with its turn stepped: a take answers the question on screen,
 * and confirmed words are kept as its answer.
 */
function withTurn(
  state: IdeaState,
  { state: turn, effects }: TurnStep
): IdeaStep {
  const question = state.screen.kind === "ask" ? state.screen.question : null
  const mapped: Array<IdeaEffect> = []
  for (const effect of effects) {
    if (effect.type === "listen" || effect.type === "keep") {
      // Only a question's turn listens or keeps.
      if (question === null) continue
      mapped.push(
        effect.type === "listen"
          ? {
              type: "listen",
              seq: effect.seq,
              answers: takeAnswers(state.ideaId, question),
            }
          : {
              type: "keep",
              op: {
                kind: "words",
                idea: state.ideaId,
                question,
                versions: effect.versions,
              },
              at: effect.at,
            }
      )
    } else {
      mapped.push(effect)
    }
  }
  return { state: { ...state, turn }, effects: mapped }
}

function ask(state: IdeaState, question: AnswerTo): IdeaState {
  return {
    ...state,
    screen: { kind: "ask", question },
    turn: nextTurn(state.turn),
  }
}

/** On to the next of Claude's questions waiting, or the kept screen. */
function advance(state: IdeaState, idea: Idea): IdeaState {
  const next = openFollowUp(idea)
  const moved = { ...state, idea, turn: { ...state.turn, notice: null } }
  return next === null
    ? { ...moved, screen: { kind: "kept" } }
    : ask(moved, next)
}

function skip(state: IdeaState, question: AnswerTo, at: string): IdeaStep {
  const { phase } = state.turn
  if (state.idea === null || phase.kind === "keeping") return same(state)
  const effects: Array<IdeaEffect> = isUnderway(phase)
    ? [{ type: "cancelListening" }]
    : []
  effects.push({
    type: "keep",
    op: { kind: "pass", idea: state.ideaId, question },
    at,
  })
  return {
    state: { ...state, turn: { ...state.turn, phase: { kind: "idle" } } },
    effects,
  }
}

/** Whether `after` shows a question `before` didn't. */
function opensQuestion(before: IdeaState, after: IdeaState): boolean {
  const was = before.screen
  const now = after.screen
  if (now.kind !== "ask") return false
  return (
    was.kind !== "ask" ||
    was.question !== now.question ||
    before.ideaId !== after.ideaId
  )
}

/**
 * The machine's step. A question that opens while the phone can't listen
 * asks again whether it can: what the listener can do changes while the
 * screen shows (home skipped for a while once it didn't answer, IH1).
 */
export function step(state: IdeaState, event: IdeaEvent): IdeaStep {
  const next = stepOn(state, event)
  if (
    next.state.turn.voice !== "unavailable" ||
    !opensQuestion(state, next.state) ||
    next.effects.some((effect) => effect.type === "checkVoice")
  ) {
    return next
  }
  return { ...next, effects: [...next.effects, { type: "checkVoice" }] }
}

function stepOn(state: IdeaState, event: IdeaEvent): IdeaStep {
  const { screen, turn } = state
  switch (event.type) {
    case "entered":
    case "readAgain": {
      return {
        state: { ...state, screen: { kind: "loading" } },
        effects:
          event.type === "entered"
            ? [{ type: "read" }, { type: "checkVoice" }]
            : [{ type: "read" }],
      }
    }
    case "listed": {
      if (screen.kind !== "loading") return same(state)
      if (event.ideas === null) {
        return same({ ...state, screen: { kind: "unreadable" } })
      }
      const focused = event.ideas.find((idea) => idea.id === state.ideaId)
      if (focused === undefined)
        return same({ ...state, screen: { kind: "unreadable" } })
      const [skipped] =
        openFollowUp(focused) === null ? skippedAsks(focused) : []
      return same(
        skipped === undefined
          ? advance(state, focused)
          : ask({ ...state, idea: focused }, skipped)
      )
    }
    case "kept": {
      const idea = event.ideas?.find((kept) => kept.id === state.ideaId)
      if (idea === undefined) {
        // Nothing kept: a confirmed answer goes back to its words.
        return turn.phase.kind === "keeping"
          ? withTurn(state, stepTurn(turn, { type: "notKept" }))
          : same({ ...state, turn: { ...turn, notice: "notKept" } })
      }
      const answered = stepTurn(turn, { type: "kept" }).state
      return same(advance({ ...state, turn: answered }, idea))
    }
    case "answerSkipped": {
      // From the Kept screen: the first of Claude's questions skipped.
      const idea = screen.kind === "kept" ? state.idea : null
      const [first] = idea === null ? [] : skippedAsks(idea)
      if (first === undefined) return same(state)
      return same(ask({ ...state, turn: { ...turn, notice: null } }, first))
    }
    case "skip": {
      return screen.kind === "ask"
        ? skip(state, screen.question, event.at)
        : same(state)
    }
    case "talk":
    case "stopTalking":
    case "meant":
    case "fix":
    case "type":
    case "draft":
    case "save": {
      return screen.kind === "ask"
        ? withTurn(state, stepTurn(turn, event))
        : same(state)
    }
    case "voiceChecked":
    case "ready":
    case "hearing":
    case "partial":
    case "listened":
    case "hidden":
    case "left": {
      return withTurn(state, stepTurn(turn, event))
    }
    default: {
      return assertNever(event)
    }
  }
}

/**
 * The number of the question on screen, and how many there are: among the
 * idea's questions, or among Claude's about `idea`.
 */
export function questionNumber(
  question: AnswerTo,
  idea: Idea | null = null
): {
  n: number
  of: number
} {
  if (isFollowUp(question)) {
    const asked = idea?.asked ?? []
    return {
      n: asked.findIndex((each) => each.id === question) + 1,
      of: asked.length,
    }
  }
  return {
    n: IDEA_QUESTIONS.indexOf(question) + 1,
    of: IDEA_QUESTIONS.length,
  }
}
