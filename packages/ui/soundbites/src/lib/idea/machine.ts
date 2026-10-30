/**
 * Catching an idea (STUDIO ST18) as one state machine: one question per
 * screen, the words appearing as they're spoken, then That's right, Fix the
 * words or Say it again. `step(state, event)` returns the next state and the
 * effects to run and does nothing else; `runtime.ts` runs them against the
 * phone's recognizer and the idea store, and the component renders a state
 * and turns taps into events (docs/monorepo-boundaries.md, "Inside a React
 * package").
 *
 * Rules that hold by structure:
 *
 * - **Only confirmed words are kept**, and each answer the moment it is
 *   confirmed, so a call, a locked screen or a closed app loses at most the
 *   answer being spoken. A fix keeps the words first heard beside it.
 * - **Capture never waits on voice.** Until the recognizer says it can
 *   listen, and from the moment it says it can't, the question takes typed
 *   words; "Type instead" is always there.
 * - **One listening at a time**, numbered: a result for an earlier one, or
 *   one that lands after the screen moved on, changes nothing.
 * - **A write is a change, never a copy.** `keep` hands the store an
 *   operation it applies to the ideas it holds (`apply`), and the screen's
 *   idea is only ever the store's answer.
 * - **Reopening resumes.** The newest idea still open at a question opens
 *   there; otherwise a new idea starts at the first question.
 */
import { assertNever } from "@some-ui/core-utils"

import type { AnswerWords, Idea, QuestionId } from "./model"
import {
  IDEA_QUESTIONS,
  isRequired,
  newIdea,
  openQuestion,
  unanswered,
  withPassed,
  withWords,
} from "./model"

/** Whether the phone's recognizer can listen. */
type Voice = "checking" | "ready" | "unavailable"

export type AskPhase =
  | { readonly kind: "idle" }
  | {
      readonly kind: "listening"
      readonly seq: number
      /** What has been heard so far; it may still change. */
      readonly words: string
    }
  | { readonly kind: "heard"; readonly words: string }
  | {
      readonly kind: "fixing"
      readonly heard: string
      readonly draft: string
    }
  | { readonly kind: "typing"; readonly draft: string }

type IdeaScreen =
  | { readonly kind: "loading" }
  | { readonly kind: "unreadable" }
  | {
      readonly kind: "ask"
      readonly question: QuestionId
      readonly phase: AskPhase
    }
  | { readonly kind: "kept" }

type IdeaNotice = "notHeard" | "listenFailed" | "notKept" | null

export type IdeaState = {
  readonly screen: IdeaScreen
  readonly voice: Voice
  /** The idea as the store last kept it; null until its first answer. */
  readonly idea: Idea | null
  /** The idea being caught: `idea`'s id, or the one it will have. */
  readonly ideaId: string
  readonly notice: IdeaNotice
  /** The last listening's number. */
  readonly seq: number
}

/** What a write does to the ideas the store holds now. */
export type IdeaOp =
  | {
      readonly kind: "words"
      readonly idea: string
      readonly question: QuestionId
      readonly versions: ReadonlyArray<AnswerWords>
    }
  | {
      readonly kind: "pass"
      readonly idea: string
      readonly question: QuestionId
    }

/** How a listening ended. */
export type Listened =
  /** Empty when nothing was heard. */
  | { readonly kind: "heard"; readonly words: string }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" }

/** Taps, as the component sends them. */
export type IdeaIntent =
  | { readonly type: "talk" }
  | { readonly type: "stopTalking" }
  | { readonly type: "right" }
  | { readonly type: "fix" }
  | { readonly type: "type" }
  | { readonly type: "draft"; readonly text: string }
  | { readonly type: "save" }
  | { readonly type: "skip" }
  | { readonly type: "answerSkipped" }
  | { readonly type: "another" }
  | { readonly type: "readAgain" }

type Stamp = { readonly at: string }

export type IdeaEvent =
  | (Exclude<IdeaIntent, { readonly type: "another" }> & Stamp)
  /** With the new idea's id. */
  | { readonly type: "another"; readonly at: string; readonly id: string }
  | ({ readonly type: "entered" } & Stamp)
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | {
      readonly type: "listed"
      /** Null when the kept ideas couldn't be read. */
      readonly ideas: ReadonlyArray<Idea> | null
    }
  | { readonly type: "voiceChecked"; readonly available: boolean }
  | { readonly type: "partial"; readonly seq: number; readonly words: string }
  | {
      readonly type: "listened"
      readonly seq: number
      readonly result: Listened
    }
  | {
      readonly type: "kept"
      /** The ideas as kept, or null when nothing was. */
      readonly ideas: ReadonlyArray<Idea> | null
    }

export type IdeaEffect =
  | { readonly type: "read" }
  | { readonly type: "checkVoice" }
  | { readonly type: "listen"; readonly seq: number }
  | { readonly type: "stopListening" }
  | { readonly type: "cancelListening" }
  | { readonly type: "keep"; readonly op: IdeaOp; readonly at: string }

export type IdeaStep = {
  readonly state: IdeaState
  readonly effects: ReadonlyArray<IdeaEffect>
}

export function initialIdeaState(ideaId: string): IdeaState {
  return {
    screen: { kind: "loading" },
    voice: "checking",
    idea: null,
    ideaId,
    notice: null,
    seq: 0,
  }
}

/**
 * The ideas with `op` applied, for the store to keep; unchanged when the
 * op names an idea the store doesn't hold and it isn't a first answer.
 */
export function apply(
  ideas: ReadonlyArray<Idea>,
  op: IdeaOp,
  at: string
): ReadonlyArray<Idea> {
  const held = ideas.find((idea) => idea.id === op.idea)
  if (held === undefined) {
    return op.kind === "words"
      ? [...ideas, newIdea(op.idea, at, op.question, op.versions)]
      : ideas
  }
  const changed =
    op.kind === "words"
      ? withWords(held, op.question, op.versions)
      : withPassed(held, op.question)
  return ideas.map((idea) => (idea === held ? changed : idea))
}

const same = (state: IdeaState): IdeaStep => ({ state, effects: [] })

/** Where a question opens: talking when the phone can listen, else typing. */
function phaseFor(voice: Voice): AskPhase {
  return voice === "unavailable"
    ? { kind: "typing", draft: "" }
    : { kind: "idle" }
}

function ask(state: IdeaState, question: QuestionId): IdeaState {
  return {
    ...state,
    screen: { kind: "ask", question, phase: phaseFor(state.voice) },
  }
}

/** The newest kept idea still open at a question, if any. */
function resumable(ideas: ReadonlyArray<Idea>): Idea | undefined {
  return ideas.filter((idea) => openQuestion(idea) !== null).at(-1)
}

function listened(state: IdeaState, seq: number, result: Listened): IdeaStep {
  const { screen } = state
  if (
    screen.kind !== "ask" ||
    screen.phase.kind !== "listening" ||
    screen.phase.seq !== seq
  ) {
    return same(state)
  }
  const sofar = screen.phase.words.trim()
  const at = (phase: AskPhase, notice: IdeaNotice): IdeaStep =>
    same({ ...state, screen: { ...screen, phase }, notice })
  switch (result.kind) {
    case "heard": {
      const words = result.words.trim() || sofar
      return words === ""
        ? at({ kind: "idle" }, "notHeard")
        : at({ kind: "heard", words }, null)
    }
    case "failed": {
      return sofar === ""
        ? at({ kind: "idle" }, "listenFailed")
        : at({ kind: "heard", words: sofar }, null)
    }
    case "unavailable": {
      return same({
        ...state,
        voice: "unavailable",
        screen: { ...screen, phase: { kind: "typing", draft: sofar } },
        notice: null,
      })
    }
    default: {
      return assertNever(result)
    }
  }
}

/** Keeps `versions` as the answer on screen. */
function keepWords(
  state: IdeaState,
  question: QuestionId,
  versions: ReadonlyArray<AnswerWords>,
  at: string
): IdeaStep {
  return {
    state,
    effects: [
      {
        type: "keep",
        op: { kind: "words", idea: state.ideaId, question, versions },
        at,
      },
    ],
  }
}

/** On to the idea's next open question, or the kept screen. */
function advance(state: IdeaState, idea: Idea): IdeaState {
  const next = openQuestion(idea)
  const moved = { ...state, idea, notice: null }
  return next === null
    ? { ...moved, screen: { kind: "kept" } }
    : ask(moved, next)
}

function onAsk(
  state: IdeaState,
  event: IdeaIntent & Stamp,
  question: QuestionId,
  phase: AskPhase
): IdeaStep {
  const withPhase = (next: AskPhase, notice = state.notice): IdeaState => ({
    ...state,
    screen: { kind: "ask", question, phase: next },
    notice,
  })
  const listen = (): IdeaStep => {
    const seq = state.seq + 1
    return {
      state: {
        ...withPhase({ kind: "listening", seq, words: "" }, null),
        seq,
      },
      effects: [{ type: "listen", seq }],
    }
  }
  switch (event.type) {
    case "talk": {
      return state.voice === "ready" &&
        (phase.kind === "idle" || phase.kind === "heard")
        ? listen()
        : same(state)
    }
    case "stopTalking": {
      return phase.kind === "listening"
        ? { state, effects: [{ type: "stopListening" }] }
        : same(state)
    }
    case "right": {
      return phase.kind === "heard"
        ? keepWords(
            state,
            question,
            [{ at: event.at, how: "heard", words: phase.words }],
            event.at
          )
        : same(state)
    }
    case "fix": {
      return phase.kind === "heard"
        ? same(
            withPhase({
              kind: "fixing",
              heard: phase.words,
              draft: phase.words,
            })
          )
        : same(state)
    }
    case "type": {
      // Heard words are confirmed or fixed, so a fix keeps them beside it.
      if (phase.kind === "idle") {
        return same(withPhase({ kind: "typing", draft: "" }))
      }
      return phase.kind === "listening"
        ? {
            state: withPhase({ kind: "typing", draft: phase.words }),
            effects: [{ type: "cancelListening" }],
          }
        : same(state)
    }
    case "draft": {
      if (phase.kind === "fixing" || phase.kind === "typing") {
        return same(withPhase({ ...phase, draft: event.text }))
      }
      return same(state)
    }
    case "save": {
      if (phase.kind !== "fixing" && phase.kind !== "typing") return same(state)
      const draft = phase.draft.trim()
      if (draft === "") return same(state)
      if (phase.kind === "typing") {
        return keepWords(
          state,
          question,
          [{ at: event.at, how: "typed", words: draft }],
          event.at
        )
      }
      const heard: AnswerWords = {
        at: event.at,
        how: "heard",
        words: phase.heard,
      }
      return keepWords(
        state,
        question,
        draft === phase.heard
          ? [heard]
          : [heard, { at: event.at, how: "fixed", words: draft }],
        event.at
      )
    }
    case "skip": {
      if (isRequired(question) || state.idea === null) return same(state)
      const effects: Array<IdeaEffect> =
        phase.kind === "listening" ? [{ type: "cancelListening" }] : []
      effects.push({
        type: "keep",
        op: { kind: "pass", idea: state.ideaId, question },
        at: event.at,
      })
      return { state: withPhase({ kind: "idle" }), effects }
    }
    case "answerSkipped":
    case "another":
    case "readAgain": {
      return same(state)
    }
    default: {
      return assertNever(event)
    }
  }
}

export function step(state: IdeaState, event: IdeaEvent): IdeaStep {
  const { screen } = state
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
      const resumed = resumable(event.ideas)
      if (resumed === undefined) return same(ask(state, IDEA_QUESTIONS[0]))
      return same(
        ask(
          { ...state, idea: resumed, ideaId: resumed.id },
          openQuestion(resumed) ?? IDEA_QUESTIONS[0]
        )
      )
    }
    case "voiceChecked": {
      const voice: Voice = event.available ? "ready" : "unavailable"
      const next: IdeaState = { ...state, voice }
      // A question opened before the answer came takes its own: typing
      // from talking only while nothing has been typed or heard yet.
      if (
        screen.kind === "ask" &&
        screen.phase.kind === "idle" &&
        voice === "unavailable"
      ) {
        return same({
          ...next,
          screen: { ...screen, phase: { kind: "typing", draft: "" } },
        })
      }
      return same(next)
    }
    case "partial": {
      if (
        screen.kind === "ask" &&
        screen.phase.kind === "listening" &&
        screen.phase.seq === event.seq
      ) {
        return same({
          ...state,
          screen: { ...screen, phase: { ...screen.phase, words: event.words } },
        })
      }
      return same(state)
    }
    case "listened": {
      return listened(state, event.seq, event.result)
    }
    case "kept": {
      if (event.ideas === null) return same({ ...state, notice: "notKept" })
      const idea = event.ideas.find((kept) => kept.id === state.ideaId)
      return same(idea === undefined ? state : advance(state, idea))
    }
    case "hidden": {
      return screen.kind === "ask" && screen.phase.kind === "listening"
        ? { state, effects: [{ type: "stopListening" }] }
        : same(state)
    }
    case "left": {
      return screen.kind === "ask" && screen.phase.kind === "listening"
        ? {
            state: {
              ...state,
              screen: { ...screen, phase: phaseFor(state.voice) },
            },
            effects: [{ type: "cancelListening" }],
          }
        : same(state)
    }
    case "answerSkipped": {
      if (screen.kind !== "kept" || state.idea === null) return same(state)
      const [first] = unanswered(state.idea)
      return first === undefined ? same(state) : same(ask(state, first))
    }
    case "another": {
      if (screen.kind !== "kept") return same(state)
      return same(
        ask(
          { ...state, idea: null, ideaId: event.id, notice: null },
          IDEA_QUESTIONS[0]
        )
      )
    }
    case "talk":
    case "stopTalking":
    case "right":
    case "fix":
    case "type":
    case "draft":
    case "save":
    case "skip": {
      return screen.kind === "ask"
        ? onAsk(state, event, screen.question, screen.phase)
        : same(state)
    }
    default: {
      return assertNever(event)
    }
  }
}

/** The number of the question on screen, and how many there are. */
export function questionNumber(question: QuestionId): {
  n: number
  of: number
} {
  return {
    n: IDEA_QUESTIONS.indexOf(question) + 1,
    of: IDEA_QUESTIONS.length,
  }
}
