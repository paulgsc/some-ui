/**
 * Catching an idea (STUDIO ST18) as one state machine: one question per
 * screen, the words appearing as they're spoken (or once home has heard the
 * take, `./hearing`), then That's right, Fix the words or Say it again.
 * `step(state, event)` returns the next state and the effects to run and
 * does nothing else; `runtime.ts` runs them against the listener (home
 * hearing a take, or the phone's recognizer) and the idea store, and the
 * component renders a state and turns taps into events
 * (docs/monorepo-boundaries.md, "Inside a React package").
 *
 * Rules that hold by structure:
 *
 * - **Only confirmed words are kept**, and each answer the moment it is
 *   confirmed, so a call, a locked screen or a closed app loses at most the
 *   answer being spoken. A fix keeps the words first heard beside it.
 * - **Capture never waits on voice.** Until the listener says it can
 *   listen, and from the moment it says it can't, the question takes typed
 *   words; "Type instead" is always there, while home hears a take too, and
 *   a take whose words don't come in time is kept and the question takes
 *   typed words (IH1, `./hearing`).
 * - **A tap is answered on screen** (LS1, www's `lib/device-listen`): a
 *   listening shows it is getting ready until the recognizer says it is
 *   listening, Done talking shows it is finishing until the words come,
 *   and a recognizer that never started says so and takes typed words.
 * - **One listening at a time**, numbered: a result for an earlier one, or
 *   one that lands after the screen moved on, changes nothing.
 * - **A write is a change, never a copy.** `keep` hands the store an
 *   operation it applies to the ideas it holds (`apply`), and the screen's
 *   idea is only ever the store's answer.
 * - **Reopening resumes.** The newest idea still open at a question opens
 *   there; otherwise a new idea starts at the first question.
 * - **Claude's questions are answered only when asked for** (ST19). A
 *   capture opened on one idea (`focus`, from the idea shelf) asks only
 *   Claude's questions about it still waiting, one per screen, the same way,
 *   or, with none waiting, the first one skipped; New idea never opens on
 *   them. One skipped waits on nothing and is answered later, as the
 *   idea's own are.
 */
import { assertNever } from "@some-ui/core-utils"
import type { RecordingFailure } from "@some-ui/voice-capture"

import type { AnswerTo, AnswerWords, Idea } from "./model"
import {
  IDEA_QUESTIONS,
  isFollowUp,
  isRequired,
  newIdea,
  openFollowUp,
  openQuestion,
  skippedAsks,
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
      /** The recognizer has said it is listening. */
      readonly ready: boolean
      /** What has been heard so far; it may still change. */
      readonly words: string
    }
  /** Done talking: waiting on the words, briefly. */
  | { readonly kind: "finishing"; readonly seq: number; readonly words: string }
  /** The take is kept, and home is hearing it (IH1): the words come later. */
  | { readonly kind: "hearing"; readonly seq: number }
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
      readonly question: AnswerTo
      readonly phase: AskPhase
    }
  | { readonly kind: "kept" }

export type IdeaNotice =
  | "notHeard"
  | "listenFailed"
  | "listenNotStarted"
  | "notKept"
  /** A take was kept, and its words didn't come in time (IH1): where it is. */
  | "keptOnHome"
  | "keptOnPhone"
  /** A take home holds, and home can't give its words back (IH1). */
  | "homeNoWords"
  /** A take was kept, and home couldn't be reached (IH1): where it is. */
  | "awayOnHome"
  | "awayOnPhone"
  /** A take couldn't be kept: no room, or it failed. */
  | "takeFull"
  | "takeNotKept"
  /** The microphone refused a take, and why. */
  | { readonly refused: RecordingFailure }
  | null

export type IdeaState = {
  readonly screen: IdeaScreen
  readonly voice: Voice
  /** The idea as the store last kept it; null until its first answer. */
  readonly idea: Idea | null
  /** The idea being caught: `idea`'s id, or the one it will have. */
  readonly ideaId: string
  /**
   * The newest other idea with questions skipped and still unanswered,
   * offered on a new idea's first screen so they can still be answered.
   */
  readonly skipped: Idea | null
  readonly notice: IdeaNotice
  /** The last listening's number. */
  readonly seq: number
  /** The idea whose waiting questions from Claude are asked, if one is. */
  readonly focus: string | null
  /** A take of the idea's answers was kept on its way home (IH1). */
  readonly took: boolean
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

/** How a listening ended. */
export type Listened =
  /** Empty when nothing was heard. */
  | { readonly kind: "heard"; readonly words: string }
  | { readonly kind: "unavailable" }
  /** The recognizer never said it was listening (LS1). */
  | { readonly kind: "notStarted" }
  | { readonly kind: "failed" }
  /**
   * The take was kept, and home's words for it didn't come (IH1): where it
   * is kept now, and why: not in time (`late`), home can't give them back
   * (`noWords`), or home couldn't be reached (`away`).
   */
  | {
      readonly kind: "kept"
      readonly on: "home" | "phone"
      readonly why: "late" | "noWords" | "away"
    }
  /** The take couldn't be kept: no room for it, or keeping it failed. */
  | { readonly kind: "notKept"; readonly why: "full" | "failed" }
  /** The microphone refused the take. */
  | { readonly kind: "refused"; readonly reason: RecordingFailure }

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
  | { readonly type: "ready"; readonly seq: number }
  /** The listening's take is kept, and home is hearing it (IH1). */
  | { readonly type: "hearing"; readonly seq: number }
  /** A take was kept that home won't hear for an answer (IH1). */
  | { readonly type: "took" }
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
  | {
      readonly type: "listen"
      readonly seq: number
      /** What a take of it answers (`takeAnswers`). */
      readonly answers: string
    }
  | { readonly type: "stopListening" }
  | { readonly type: "cancelListening" }
  | { readonly type: "keep"; readonly op: IdeaOp; readonly at: string }

export type IdeaStep = {
  readonly state: IdeaState
  readonly effects: ReadonlyArray<IdeaEffect>
}

export function initialIdeaState(
  ideaId: string,
  focus: string | null = null
): IdeaState {
  return {
    screen: { kind: "loading" },
    voice: "checking",
    idea: null,
    ideaId,
    skipped: null,
    notice: null,
    seq: 0,
    focus,
    took: false,
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

function ask(state: IdeaState, question: AnswerTo): IdeaState {
  return {
    ...state,
    screen: { kind: "ask", question, phase: phaseFor(state.voice) },
  }
}

/** The newest idea besides `id` with skipped questions still unanswered. */
function newestSkipped(ideas: ReadonlyArray<Idea>, id: string): Idea | null {
  return (
    ideas
      .filter((idea) => idea.id !== id && unanswered(idea).length > 0)
      .at(-1) ?? null
  )
}

/** The newest kept idea still open at a question, if any. */
function resumable(ideas: ReadonlyArray<Idea>): Idea | undefined {
  return ideas.filter((idea) => openQuestion(idea) !== null).at(-1)
}

type Underway = Extract<
  AskPhase,
  { kind: "listening" | "finishing" | "hearing" }
>

/** A listening is under way: started, finishing, or its take being heard. */
function isUnderway(phase: AskPhase): phase is Underway {
  return (
    phase.kind === "listening" ||
    phase.kind === "finishing" ||
    phase.kind === "hearing"
  )
}

/** Whether a listening numbered `seq` is on screen, under way. */
function underway(phase: AskPhase, seq: number): phase is Underway {
  return isUnderway(phase) && phase.seq === seq
}

/** The words a listening under way has heard so far. */
function sofarOf(phase: Underway): string {
  return phase.kind === "hearing" ? "" : phase.words.trim()
}

/** Where a take whose words didn't come is kept, and why, as a notice. */
function keptNotice(result: Extract<Listened, { kind: "kept" }>): IdeaNotice {
  switch (result.why) {
    case "late": {
      return result.on === "home" ? "keptOnHome" : "keptOnPhone"
    }
    case "noWords": {
      return "homeNoWords"
    }
    case "away": {
      return result.on === "home" ? "awayOnHome" : "awayOnPhone"
    }
    default: {
      return assertNever(result.why)
    }
  }
}

function listened(state: IdeaState, seq: number, result: Listened): IdeaStep {
  const { screen } = state
  if (screen.kind !== "ask" || !underway(screen.phase, seq)) {
    return same(state)
  }
  const sofar = sofarOf(screen.phase)
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
    case "notStarted": {
      // This question takes typed words; the next may try the voice again.
      return at({ kind: "typing", draft: sofar }, "listenNotStarted")
    }
    case "kept": {
      // The take is kept; its words for this answer are typed (IH1).
      const typing = at({ kind: "typing", draft: sofar }, keptNotice(result))
      // Home didn't answer: what the listener can do next may have changed.
      return result.why === "away"
        ? { ...typing, effects: [{ type: "checkVoice" }] }
        : typing
    }
    case "notKept": {
      return at(
        { kind: "idle" },
        result.why === "full" ? "takeFull" : "takeNotKept"
      )
    }
    case "refused": {
      return at({ kind: "idle" }, { refused: result.reason })
    }
    default: {
      return assertNever(result)
    }
  }
}

/** Keeps `versions` as the answer on screen. */
function keepWords(
  state: IdeaState,
  question: AnswerTo,
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

/** The question `idea` is open at: Claude's, for a capture focused on it. */
function nextFor(state: IdeaState, idea: Idea): AnswerTo | null {
  return state.focus === null ? openQuestion(idea) : openFollowUp(idea)
}

/** On to the idea's next open question, or the kept screen. */
function advance(state: IdeaState, idea: Idea): IdeaState {
  const next = nextFor(state, idea)
  const moved = { ...state, idea, notice: null }
  return next === null
    ? { ...moved, screen: { kind: "kept" } }
    : ask(moved, next)
}

function onAsk(
  state: IdeaState,
  event: IdeaIntent & Stamp,
  question: AnswerTo,
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
        ...withPhase({ kind: "listening", seq, ready: false, words: "" }, null),
        seq,
      },
      effects: [
        { type: "listen", seq, answers: takeAnswers(state.ideaId, question) },
      ],
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
        ? {
            state: withPhase({
              kind: "finishing",
              seq: phase.seq,
              words: phase.words,
            }),
            effects: [{ type: "stopListening" }],
          }
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
      return isUnderway(phase)
        ? {
            state: withPhase({ kind: "typing", draft: sofarOf(phase) }),
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
      const effects: Array<IdeaEffect> = isUnderway(phase)
        ? [{ type: "cancelListening" }]
        : []
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
      if (state.focus !== null) {
        const focused = event.ideas.find((idea) => idea.id === state.focus)
        if (focused === undefined)
          return same({ ...state, screen: { kind: "unreadable" } })
        const [skipped] =
          openFollowUp(focused) === null ? skippedAsks(focused) : []
        const on = { ...state, ideaId: focused.id }
        return same(
          skipped === undefined
            ? advance(on, focused)
            : ask({ ...on, idea: focused }, skipped)
        )
      }
      const resumed = resumable(event.ideas)
      if (resumed === undefined) {
        const skipped = newestSkipped(event.ideas, state.ideaId)
        return same(ask({ ...state, skipped }, IDEA_QUESTIONS[0]))
      }
      return same(
        ask(
          {
            ...state,
            idea: resumed,
            ideaId: resumed.id,
            skipped: newestSkipped(event.ideas, resumed.id),
          },
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
    case "ready": {
      if (
        screen.kind === "ask" &&
        screen.phase.kind === "listening" &&
        screen.phase.seq === event.seq
      ) {
        return same({
          ...state,
          screen: { ...screen, phase: { ...screen.phase, ready: true } },
        })
      }
      return same(state)
    }
    case "hearing": {
      if (
        screen.kind === "ask" &&
        underway(screen.phase, event.seq) &&
        screen.phase.kind !== "hearing"
      ) {
        return same({
          ...state,
          took: true,
          screen: { ...screen, phase: { kind: "hearing", seq: event.seq } },
        })
      }
      return same(state)
    }
    case "took": {
      return state.took ? same(state) : same({ ...state, took: true })
    }
    case "partial": {
      if (
        screen.kind === "ask" &&
        underway(screen.phase, event.seq) &&
        screen.phase.kind !== "hearing"
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
      const next = {
        ...state,
        skipped: newestSkipped(event.ideas, state.ideaId),
      }
      return same(idea === undefined ? next : advance(next, idea))
    }
    case "hidden": {
      return screen.kind === "ask" && screen.phase.kind === "listening"
        ? {
            state: {
              ...state,
              screen: {
                ...screen,
                phase: {
                  kind: "finishing",
                  seq: screen.phase.seq,
                  words: screen.phase.words,
                },
              },
            },
            effects: [{ type: "stopListening" }],
          }
        : same(state)
    }
    case "left": {
      return screen.kind === "ask" && isUnderway(screen.phase)
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
      // The idea just kept, from its Kept screen; or, from a new idea's
      // first screen with nothing kept yet, the newest one with questions
      // skipped.
      const fromKept = screen.kind === "kept" ? state.idea : null
      const fromNew =
        screen.kind === "ask" &&
        state.idea === null &&
        (screen.phase.kind === "idle" || screen.phase.kind === "typing")
          ? state.skipped
          : null
      const idea = fromKept ?? fromNew
      const skippedOf = state.focus === null ? unanswered : skippedAsks
      const [first] = idea === null ? [] : skippedOf(idea)
      if (idea === null || first === undefined) return same(state)
      return same(
        ask(
          {
            ...state,
            idea,
            ideaId: idea.id,
            skipped: fromNew === null ? state.skipped : null,
            notice: null,
          },
          first
        )
      )
    }
    case "another": {
      if (screen.kind !== "kept") return same(state)
      return same(
        ask(
          {
            ...state,
            idea: null,
            ideaId: event.id,
            notice: null,
            focus: null,
            took: false,
          },
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
