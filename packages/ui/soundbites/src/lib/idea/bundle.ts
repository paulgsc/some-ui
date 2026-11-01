/**
 * A new idea as one bundle (STUDIO ST26, #2453), as one state machine: what
 * it is (its title, topic, keywords and format), then its questions, one card
 * each, swiped between, each answer said as a take on the take pattern and
 * heard back, then the whole idea looked over and sent together.
 * `stepBundle(state, event)` returns the next state and the effects to run
 * and does nothing else; `./bundle-runtime` runs them against the take
 * pattern, the draft, the ideas kept and home, and the component renders a
 * state and turns taps into events (docs/monorepo-boundaries.md, "Inside a
 * React package").
 *
 * Rules that hold by structure:
 *
 * - **Nothing leaves before Send.** Each take is kept on the take pattern
 *   with `send: "on-confirm"`, waiting on the phone; Send adds the idea,
 *   whole and dated, to the ideas kept, and only then lets its takes go
 *   (`send`'s `release`).
 * - **Deleting before Send is gone for good, and asks first** (the owner's
 *   ruling on #2265): one answer (`askDelete`, then `confirmed`) or the
 *   whole idea (`askDeleteAll`). Nothing else deletes.
 * - **Typing is the fallback, never the default.** A card offers typing only
 *   once voice didn't come through for it (a take the microphone refused,
 *   that failed, or that had no room), and a typed answer offers "Say it
 *   instead": a take kept for it takes the typed words' place.
 * - **Nothing moves while a take is under way**: a swipe, a dot, Look it
 *   over and Back wait until it ends, and leaving the screen keeps it.
 * - **One play at a time.** Play all plays each answer's take in order,
 *   one after the other, and any other play or tap stops it.
 * - **Send needs a title and the first answer**; the other questions can
 *   wait (the owner, #2453), and go as passed over.
 */
import { assertNever } from "@some-ui/core-utils"
import type { PatternTake, TakeEnded } from "@some-ui/voice-capture"

import type { IdeaDraft, IdeaLists } from "./draft"
import { answersOf, IDEA_LISTS_SEED, newDraft, questionOf } from "./draft"
import type { AnswerTake, Idea, IdeaFormat, QuestionId } from "./model"
import { IDEA_QUESTIONS, isRequired, TITLE_MAX, TYPED_MAX } from "./model"

/** The questions' version a bundle answers. */
const QUESTIONS_VERSION = 1

/** How far a person is through a new idea. */
type BundleScreen =
  | "loading"
  /** What is kept on this phone can't be read, so nothing can be kept. */
  | "unreadable"
  | "about"
  | "questions"
  | "review"
  | "sent"

/** A card's own state, besides its take and typed words. */
type CardMode =
  /** Voice didn't come through for it: nothing was kept. */
  | { readonly kind: "failed" }
  /** Typing instead, because voice didn't work. */
  | { readonly kind: "typing"; readonly text: string }

/** A permanent step, asked first. */
type BundleConfirm =
  | { readonly kind: "answer"; readonly question: QuestionId }
  | { readonly kind: "all" }

/** Where home is, as far as this phone can tell (`IdeaHome`). */
export type HomeReach = "near" | "away" | "unpaired"

/** What the screen says once, after something happened. */
export type BundleNotice =
  /** One answer deleted before Send. */
  | "deleted"
  /** The whole idea deleted before Send. */
  | "deletedAll"
  /** A change this phone couldn't keep. */
  | "notKept"
  /** The idea couldn't be kept on this phone, so nothing was sent. */
  | "notSent"
  /** The answer couldn't be deleted. */
  | "notDeleted"

export type BundleState = {
  readonly screen: BundleScreen
  readonly draft: IdeaDraft
  /** The takes on the phone's desk of idea takes, as it lists them. */
  readonly takes: ReadonlyArray<PatternTake>
  /** The card on screen, 0 to `IDEA_QUESTIONS.length - 1`. */
  readonly index: number
  readonly modes: Partial<Readonly<Record<QuestionId, CardMode>>>
  /** A take is under way. */
  readonly busy: boolean
  /** The take being read or playing, if one is. */
  readonly playing: string | null
  /** Play all: the takes still to play after the one playing, in order. */
  readonly playAll: ReadonlyArray<string> | null
  readonly confirm: BundleConfirm | null
  readonly lists: IdeaLists
  readonly reach: HomeReach
  readonly notice: BundleNotice | null
  /** The idea just sent, on the sent screen. */
  readonly sent: Idea | null
}

type Stamp = { readonly at: string }

/** Taps, as the component sends them. */
export type BundleIntent =
  | { readonly type: "format"; readonly format: IdeaFormat }
  | { readonly type: "title"; readonly text: string }
  | { readonly type: "topic"; readonly topic: string }
  | { readonly type: "keyword"; readonly keyword: string }
  | { readonly type: "start" }
  | { readonly type: "go"; readonly index: number }
  | { readonly type: "swipe"; readonly to: "next" | "prev" }
  /** The take button, Try again, Say it instead, Redo: a take, or its stop. */
  | { readonly type: "tap"; readonly question: QuestionId }
  /** Plays a take, or stops it when it is the one playing. */
  | { readonly type: "play"; readonly take: string }
  | { readonly type: "playAll" }
  | { readonly type: "askDelete"; readonly question: QuestionId }
  | { readonly type: "askDeleteAll" }
  | { readonly type: "confirmed" }
  | { readonly type: "keepIt" }
  | { readonly type: "typeInstead"; readonly question: QuestionId }
  | {
      readonly type: "typed"
      readonly question: QuestionId
      readonly text: string
    }
  | { readonly type: "keepTyped"; readonly question: QuestionId }
  | { readonly type: "later"; readonly question: QuestionId }
  | { readonly type: "review" }
  | { readonly type: "change" }
  | { readonly type: "back" }
  | { readonly type: "send" }
  | { readonly type: "another" }
  | { readonly type: "readAgain" }

export type BundleEvent =
  | (Exclude<BundleIntent, { type: "another" }> & Stamp)
  /** With the next draft's id. */
  | ({ readonly type: "another"; readonly id: string } & Stamp)
  | ({ readonly type: "entered" } & Stamp)
  | { readonly type: "left" }
  | {
      readonly type: "opened"
      /** The draft kept, null for none, undefined when unreadable. */
      readonly draft: IdeaDraft | null | undefined
      /** The ideas already kept; null when they can't be read. */
      readonly kept: ReadonlyArray<Idea> | null
      readonly takes: ReadonlyArray<PatternTake>
      readonly lists: IdeaLists
      /** For a new draft, should none be kept. */
      readonly id: string
      readonly at: string
    }
  | { readonly type: "takes"; readonly takes: ReadonlyArray<PatternTake> }
  | { readonly type: "busy"; readonly busy: boolean }
  | { readonly type: "ended"; readonly ended: TakeEnded }
  | { readonly type: "playing"; readonly take: string | null }
  | { readonly type: "reach"; readonly reach: HomeReach }
  | { readonly type: "draftKept"; readonly kept: boolean }
  /** Send's outcome: the idea as kept, or null when it couldn't be. */
  | { readonly type: "sentKept"; readonly idea: Idea | null }
  /** Delete all's outcome, with the next draft's id. */
  | ({
      readonly type: "deletedAll"
      readonly deleted: boolean
      readonly id: string
    } & Stamp)
  /** One answer's delete: false when the store couldn't. */
  | { readonly type: "deleted"; readonly deleted: boolean }

export type BundleEffect =
  | { readonly type: "open" }
  | { readonly type: "keepDraft"; readonly draft: IdeaDraft | null }
  /** D1's tap: starts a take answering `answers`, or stops the one under way. */
  | {
      readonly type: "tap"
      readonly answers: string
      readonly supersedes: string | null
    }
  | { readonly type: "play"; readonly take: string }
  | { readonly type: "stopPlaying" }
  /** Deletes a take that never left the phone, for good. */
  | { readonly type: "deleteTake"; readonly take: string }
  /** Deletes the draft and every take it has, for good. */
  | { readonly type: "deleteAll"; readonly takes: ReadonlyArray<string> }
  /**
   * Keeps `idea` with the ideas kept, then lets `takes` go home, then
   * clears the draft.
   */
  | {
      readonly type: "send"
      readonly idea: Idea
      readonly takes: ReadonlyArray<string>
    }
  /** Lets the takes of ideas already kept go home. */
  | { readonly type: "settle"; readonly takes: ReadonlyArray<string> }
  /** The screen went: a take under way is kept, and nothing plays. */
  | { readonly type: "leave" }

export type BundleStep = {
  readonly state: BundleState
  readonly effects: ReadonlyArray<BundleEffect>
}

export function initialBundle(id: string, at: string): BundleState {
  return {
    screen: "loading",
    draft: newDraft(id, at, IDEA_LISTS_SEED),
    takes: [],
    index: 0,
    modes: {},
    busy: false,
    playing: null,
    playAll: null,
    confirm: null,
    lists: IDEA_LISTS_SEED,
    reach: "unpaired",
    notice: null,
    sent: null,
  }
}

const same = (state: BundleState): BundleStep => ({ state, effects: [] })

/** The draft's takes: every one answering one of its questions. */
function draftTakes(
  state: Pick<BundleState, "draft" | "takes">
): ReadonlyArray<PatternTake> {
  return state.takes.filter(
    (take) => questionOf(state.draft.id, take.answers) !== null
  )
}

/** The take that answers `question` now, if one does. */
function currentTake(
  state: Pick<BundleState, "draft" | "takes">,
  question: QuestionId
): PatternTake | null {
  const answers = answersOf(state.draft.id, question)
  return (
    state.takes
      .filter((take) => take.answers === answers && take.standing === "current")
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0] ?? null
  )
}

/** How a question stands: said, typed, or neither yet. */
export type Answered = "said" | "typed" | null

export function answered(
  state: Pick<BundleState, "draft" | "takes">,
  question: QuestionId
): Answered {
  if (currentTake(state, question) !== null) return "said"
  return state.draft.typed[question] === undefined ? null : "typed"
}

/** What Send still needs: a title, then the first answer. */
export function missing(
  state: Pick<BundleState, "draft" | "takes">
): "title" | "first" | null {
  if (state.draft.about.title.trim() === "") return "title"
  const first = IDEA_QUESTIONS.find(isRequired)
  return first !== undefined && answered(state, first) === null ? "first" : null
}

/** How many questions are answered, said or typed. */
export function answeredCount(
  state: Pick<BundleState, "draft" | "takes">
): number {
  return IDEA_QUESTIONS.filter((question) => answered(state, question) !== null)
    .length
}

/**
 * The idea a draft sends: what it is, each answer said (its takes, oldest
 * first, the current one last) or typed, and the questions with neither
 * passed over.
 */
export function bundleIdea(
  state: Pick<BundleState, "draft" | "takes">,
  at: string
): Idea {
  const { draft } = state
  const answers = IDEA_QUESTIONS.flatMap((question) => {
    const current = currentTake(state, question)
    if (current !== null) {
      const answers = answersOf(draft.id, question)
      const takes = state.takes
        .filter(
          (take) =>
            take.answers === answers &&
            take.standing !== "set-aside" &&
            take.id !== current.id
        )
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
        .map((take): AnswerTake => ({ at: take.recordedAt, take: take.id }))
      return [
        {
          question,
          versions: [],
          takes: [...takes, { at: current.recordedAt, take: current.id }],
        },
      ]
    }
    const typed = draft.typed[question]
    return typed === undefined
      ? []
      : [
          {
            question,
            versions: [{ at, how: "typed" as const, words: typed }],
          },
        ]
  })
  const said = new Set(answers.map((answer) => answer.question))
  return {
    id: draft.id,
    at: draft.at,
    questions: QUESTIONS_VERSION,
    answers,
    passed: IDEA_QUESTIONS.filter((question) => !said.has(question)),
    about: { ...draft.about, title: draft.about.title.trim() },
    sent: [at],
  }
}

/** The draft changed, and kept. */
function withDraft(state: BundleState, draft: IdeaDraft): BundleStep {
  return {
    state: { ...state, draft, notice: null },
    effects: [{ type: "keepDraft", draft }],
  }
}

function withoutLater(draft: IdeaDraft, question: QuestionId): IdeaDraft {
  return draft.later.includes(question)
    ? { ...draft, later: draft.later.filter((each) => each !== question) }
    : draft
}

function withoutTyped(draft: IdeaDraft, question: QuestionId): IdeaDraft {
  if (draft.typed[question] === undefined) return draft
  const typed = Object.fromEntries(
    Object.entries(draft.typed).filter(([key]) => key !== question)
  )
  return { ...draft, typed }
}

function withMode(
  state: BundleState,
  question: QuestionId,
  mode: CardMode | null
): BundleState {
  const modes = Object.fromEntries(
    Object.entries(state.modes).filter(([key]) => key !== question)
  )
  return {
    ...state,
    modes: mode === null ? modes : { ...modes, [question]: mode },
  }
}

/** Stops Play all, and what plays, before something else happens. */
function hushed(state: BundleState): BundleStep {
  if (state.playAll === null && state.playing === null) return same(state)
  return {
    state: { ...state, playAll: null },
    effects: state.playing === null ? [] : [{ type: "stopPlaying" }],
  }
}

function then(
  first: BundleStep,
  next: (state: BundleState) => BundleStep
): BundleStep {
  const second = next(first.state)
  return {
    state: second.state,
    effects: [...first.effects, ...second.effects],
  }
}

/** The card at `index`, within the questions. */
function clamp(index: number): number {
  return Math.max(0, Math.min(IDEA_QUESTIONS.length - 1, index))
}

const MOVES: ReadonlySet<BundleEvent["type"]> = new Set([
  "go",
  "swipe",
  "review",
  "change",
  "back",
  "start",
  "send",
  "askDeleteAll",
  "another",
  "playAll",
])

/** A tap on a question's take button, or one of the cards' ways to say it. */
function tapped(state: BundleState, question: QuestionId): BundleStep {
  const answers = answersOf(state.draft.id, question)
  // The take under way, wherever it is, is stopped by its own button only.
  if (state.busy) {
    return {
      state,
      effects: [{ type: "tap", answers, supersedes: null }],
    }
  }
  const current = currentTake(state, question)
  const draft = withoutLater(state.draft, question)
  const cleared = withMode(
    { ...state, playAll: null, confirm: null, notice: null, draft },
    question,
    null
  )
  return {
    state: {
      ...cleared,
      index: IDEA_QUESTIONS.indexOf(question),
      screen: "questions",
    },
    // Kept first, so the takes it is about to have are named by a kept draft.
    effects: [
      { type: "keepDraft", draft },
      { type: "tap", answers, supersedes: current?.id ?? null },
    ],
  }
}

/** A take ended: a kept one answers its card; one voice lost says so. */
function takeEnded(state: BundleState, ended: TakeEnded): BundleStep {
  const question = questionOf(state.draft.id, ended.answers)
  if (question === null) return same(state)
  switch (ended.ending) {
    case "kept": {
      const draft = withoutTyped(withoutLater(state.draft, question), question)
      const next = withMode(state, question, null)
      return draft === state.draft ? same(next) : withDraft(next, draft)
    }
    case "blocked":
    case "failed":
    case "full": {
      // A card that has its take keeps it; the pattern says how this one ended.
      if (currentTake(state, question) !== null) return same(state)
      return same(withMode(state, question, { kind: "failed" }))
    }
    case "short":
    case "early": {
      return same(state)
    }
    default: {
      return assertNever(ended.ending)
    }
  }
}

function onIntent(
  state: BundleState,
  event: Exclude<BundleIntent, { type: "another" }> & Stamp
): BundleStep {
  const { draft } = state
  switch (event.type) {
    case "format": {
      return draft.about.format === event.format
        ? same(state)
        : withDraft(state, {
            ...draft,
            about: { ...draft.about, format: event.format },
          })
    }
    case "title": {
      const title = event.text.slice(0, TITLE_MAX)
      return title === draft.about.title
        ? same(state)
        : withDraft(state, { ...draft, about: { ...draft.about, title } })
    }
    case "topic": {
      if (!state.lists.topics.includes(event.topic)) return same(state)
      return draft.about.topic === event.topic
        ? same(state)
        : withDraft(state, {
            ...draft,
            about: { ...draft.about, topic: event.topic },
          })
    }
    case "keyword": {
      const { keywords } = draft.about
      if (keywords.includes(event.keyword)) {
        return withDraft(state, {
          ...draft,
          about: {
            ...draft.about,
            keywords: keywords.filter((each) => each !== event.keyword),
          },
        })
      }
      if (!state.lists.keywords.includes(event.keyword)) return same(state)
      return withDraft(state, {
        ...draft,
        about: { ...draft.about, keywords: [...keywords, event.keyword] },
      })
    }
    case "start": {
      return state.screen === "about"
        ? same({ ...state, screen: "questions", notice: null })
        : same(state)
    }
    case "go": {
      return state.screen === "questions"
        ? then(hushed(state), (quiet) =>
            same({ ...quiet, index: clamp(event.index) })
          )
        : same(state)
    }
    case "swipe": {
      if (state.screen !== "questions") return same(state)
      const index = clamp(state.index + (event.to === "next" ? 1 : -1))
      return index === state.index
        ? same(state)
        : then(hushed(state), (quiet) => same({ ...quiet, index }))
    }
    case "tap": {
      if (state.screen !== "questions" && state.screen !== "review") {
        return same(state)
      }
      return tapped(state, event.question)
    }
    case "play": {
      if (state.busy) return same(state)
      return {
        state: { ...state, playAll: null, notice: null },
        effects: [{ type: "play", take: event.take }],
      }
    }
    case "playAll": {
      if (state.playAll !== null) return hushed(state)
      const queue = IDEA_QUESTIONS.flatMap((question) => {
        const take = currentTake(state, question)
        return take === null ? [] : [take.id]
      })
      const [first, ...rest] = queue
      if (first === undefined) return same(state)
      return {
        state: { ...state, playAll: rest, notice: null },
        effects: [{ type: "play", take: first }],
      }
    }
    case "askDelete": {
      if (answered(state, event.question) === null) return same(state)
      return then(hushed(state), (quiet) =>
        same({
          ...quiet,
          confirm: { kind: "answer", question: event.question },
        })
      )
    }
    case "askDeleteAll": {
      return then(hushed(state), (quiet) =>
        same({ ...quiet, confirm: { kind: "all" } })
      )
    }
    case "keepIt": {
      return same({ ...state, confirm: null })
    }
    case "confirmed": {
      const { confirm } = state
      if (confirm === null) return same(state)
      if (confirm.kind === "all") {
        return {
          state: { ...state, confirm: null },
          effects: [
            {
              type: "deleteAll",
              takes: draftTakes(state).map((take) => take.id),
            },
          ],
        }
      }
      const { question } = confirm
      const take = currentTake(state, question)
      const closed = { ...state, confirm: null }
      if (take !== null) {
        return {
          state: closed,
          effects: [{ type: "deleteTake", take: take.id }],
        }
      }
      const typed = withoutTyped(draft, question)
      return typed === draft
        ? same(closed)
        : {
            state: { ...closed, draft: typed, notice: "deleted" },
            effects: [{ type: "keepDraft", draft: typed }],
          }
    }
    case "typeInstead": {
      return state.modes[event.question]?.kind === "failed"
        ? same(withMode(state, event.question, { kind: "typing", text: "" }))
        : same(state)
    }
    case "typed": {
      return state.modes[event.question]?.kind === "typing"
        ? same(
            withMode(state, event.question, {
              kind: "typing",
              text: event.text.slice(0, TYPED_MAX),
            })
          )
        : same(state)
    }
    case "keepTyped": {
      const mode = state.modes[event.question]
      if (mode?.kind !== "typing") return same(state)
      const text = mode.text.trim()
      if (text === "") return same(state)
      const kept = withoutLater(draft, event.question)
      return withDraft(withMode(state, event.question, null), {
        ...kept,
        typed: { ...kept.typed, [event.question]: text },
      })
    }
    case "later": {
      const index = IDEA_QUESTIONS.indexOf(event.question)
      const next = withMode(
        { ...state, index: clamp(index + 1) },
        event.question,
        null
      )
      return draft.later.includes(event.question)
        ? same(next)
        : withDraft(next, {
            ...draft,
            later: [...draft.later, event.question],
          })
    }
    case "review": {
      return state.screen === "questions"
        ? then(hushed(state), (quiet) =>
            same({ ...quiet, screen: "review", notice: null })
          )
        : same(state)
    }
    case "change": {
      return state.screen === "review"
        ? then(hushed(state), (quiet) =>
            same({ ...quiet, screen: "about", notice: null })
          )
        : same(state)
    }
    case "back": {
      const to: BundleScreen | null =
        state.screen === "questions"
          ? "about"
          : state.screen === "review"
            ? "questions"
            : null
      return to === null
        ? same(state)
        : then(hushed(state), (quiet) =>
            same({ ...quiet, screen: to, notice: null })
          )
    }
    case "send": {
      if (state.screen !== "review" || missing(state) !== null) {
        return same(state)
      }
      return then(hushed(state), (quiet) => ({
        state: quiet,
        effects: [
          {
            type: "send",
            idea: bundleIdea(quiet, event.at),
            takes: draftTakes(quiet).map((take) => take.id),
          },
        ],
      }))
    }
    case "readAgain": {
      return state.screen === "unreadable"
        ? {
            state: { ...state, screen: "loading" },
            effects: [{ type: "open" }],
          }
        : same(state)
    }
    default: {
      return assertNever(event)
    }
  }
}

/** The machine's step. */
export function stepBundle(state: BundleState, event: BundleEvent): BundleStep {
  // Nothing moves, and nothing is deleted or sent, while a take is under way.
  if (state.busy && MOVES.has(event.type)) return same(state)
  switch (event.type) {
    case "entered": {
      return {
        state: { ...state, screen: "loading" },
        effects: [{ type: "open" }],
      }
    }
    case "left": {
      return {
        state: { ...state, playAll: null },
        effects: [{ type: "leave" }],
      }
    }
    case "opened": {
      if (state.screen !== "loading") return same(state)
      const { lists, draft, kept } = event
      if (draft === undefined || kept === null) {
        return same({ ...state, screen: "unreadable", lists })
      }
      const opened = { ...state, lists, takes: event.takes }
      // A take a kept idea names, still on this phone alone, waits on a
      // Send that kept the idea and couldn't let it go: it goes now.
      const named = new Set(
        kept.flatMap((idea) =>
          idea.answers.flatMap((answer) =>
            (answer.takes ?? []).map((each) => each.take)
          )
        )
      )
      const settle: ReadonlyArray<BundleEffect> = event.takes.some(
        (take) => named.has(take.id) && take.kept?.place === "phone"
      )
        ? [
            {
              type: "settle",
              takes: event.takes
                .filter((take) => named.has(take.id))
                .map((take) => take.id),
            },
          ]
        : []
      const fresh = newDraft(event.id, event.at, lists)
      if (draft === null) {
        return {
          state: { ...opened, draft: fresh, screen: "about" },
          effects: settle,
        }
      }
      if (kept.some((idea) => idea.id === draft.id)) {
        // Sent before the screen could clear it: it goes.
        return {
          state: { ...opened, draft: fresh, screen: "about" },
          effects: [...settle, { type: "keepDraft", draft: null }],
        }
      }
      return {
        state: {
          ...opened,
          draft,
          screen: draft.about.title === "" ? "about" : "questions",
        },
        effects: settle,
      }
    }
    case "takes": {
      return same({ ...state, takes: event.takes })
    }
    case "busy": {
      return event.busy === state.busy
        ? same(state)
        : same({ ...state, busy: event.busy })
    }
    case "ended": {
      return takeEnded(state, event.ended)
    }
    case "playing": {
      if (event.take === state.playing) return same(state)
      const next = { ...state, playing: event.take }
      // Play all: the take that played ended, so the next one plays.
      if (event.take === null && state.playAll !== null) {
        const [first, ...rest] = state.playAll
        return first === undefined
          ? same({ ...next, playAll: null })
          : {
              state: { ...next, playAll: rest },
              effects: [{ type: "play", take: first }],
            }
      }
      return same(next)
    }
    case "reach": {
      return same({ ...state, reach: event.reach })
    }
    case "draftKept": {
      return event.kept ? same(state) : same({ ...state, notice: "notKept" })
    }
    case "sentKept": {
      if (event.idea === null) return same({ ...state, notice: "notSent" })
      return same({
        ...state,
        screen: "sent",
        sent: event.idea,
        modes: {},
        index: 0,
        notice: null,
      })
    }
    case "deletedAll": {
      if (!event.deleted) return same({ ...state, notice: "notDeleted" })
      return same({
        ...state,
        draft: newDraft(event.id, event.at, state.lists),
        screen: "about",
        modes: {},
        index: 0,
        notice: "deletedAll",
      })
    }
    case "deleted": {
      return same({
        ...state,
        notice: event.deleted ? "deleted" : "notDeleted",
      })
    }
    case "another": {
      if (state.screen !== "sent") return same(state)
      return same({
        ...state,
        draft: newDraft(event.id, event.at, state.lists),
        screen: "about",
        sent: null,
        notice: null,
      })
    }
    case "format":
    case "title":
    case "topic":
    case "keyword":
    case "start":
    case "go":
    case "swipe":
    case "tap":
    case "play":
    case "playAll":
    case "askDelete":
    case "askDeleteAll":
    case "confirmed":
    case "keepIt":
    case "typeInstead":
    case "typed":
    case "keepTyped":
    case "later":
    case "review":
    case "change":
    case "back":
    case "send":
    case "readAgain": {
      return onIntent(state, event)
    }
    default: {
      return assertNever(event)
    }
  }
}

/** Where a card is: its take under way, a block of its own, or its take. */
export type CardView =
  | { readonly kind: "failed" }
  | { readonly kind: "typing"; readonly text: string }
  | { readonly kind: "typed"; readonly words: string }
  | { readonly kind: "later" }
  /** The take pattern's item: its button and its take, if it has one. */
  | { readonly kind: "take" }

/**
 * What a card shows. `recording`: this card's take is under way, which the
 * pattern's item shows whatever else the card holds.
 */
export function cardView(
  state: BundleState,
  question: QuestionId,
  recording: boolean
): CardView {
  if (recording) return { kind: "take" }
  const mode = state.modes[question]
  if (mode !== undefined) return mode
  if (currentTake(state, question) !== null) return { kind: "take" }
  const typed = state.draft.typed[question]
  if (typed !== undefined) return { kind: "typed", words: typed }
  return state.draft.later.includes(question)
    ? { kind: "later" }
    : { kind: "take" }
}

/** A swipe's travel, as a step: past `SWIPE_PX` either way, a card over. */
const SWIPE_PX = 60

export function swipeOf(dx: number): "next" | "prev" | null {
  if (dx <= -SWIPE_PX) return "next"
  if (dx >= SWIPE_PX) return "prev"
  return null
}
