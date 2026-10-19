import type {
  SessionEvent,
  SessionLog,
} from "@leetype/lib/leetype/session-log/model"
import type {
  ChoiceScreen,
  SessionFile,
  SessionScreen,
} from "@leetype/types/session-file"
import { assertNever } from "@some-ui/core-utils"

/**
 * Playing a session file (canon v1.2, Def. 1.9, Def. 9.3, Def. 9.4,
 * Prop. 9.4, Prop. 9.6): where the learner is in its graph of screens, and
 * what each input records. `step` is pure; the runtime (`./index.ts`) owns
 * the clock, the ids and the log the events go to.
 *
 * - A round's reveal follows its commitment. A correct, unhurried pick
 *   reveals the worked confirmation (every option's reason); a struggle
 *   reveals only what the picked option breaks, never which option is
 *   right, and its way on is a placement.
 * - Continuing from a struggle into a reading places it and parks the round;
 *   from a correct pick into a reading, offers it as a pointer.
 * - A parked round's worked confirmation and its return stay one action
 *   away (Prop. 9.4 (d)), and taking either is recorded.
 * - The learner may leave at any round boundary, which is any screen not
 *   showing a reveal (Prop. 9.6).
 */

export type PlayForm = "full" | "short"

/** The short form: one incident and its take (Prop. 9.6). */
export const SHORT_FORM_MINUTES = 5

/** Selections needed before slowness can be judged (Def. 9.4). */
const MEDIAN_AFTER = 5

type Answer = Extract<SessionEvent, { type: "picked" }>["answer"]

export type Reveal = {
  readonly option: number
  readonly answer: Answer
  /** Def. 9.4: incorrect, abstained, or slow. */
  readonly struggled: boolean
  /** The worked confirmation is shown: earned, or asked for. */
  readonly confirmation: boolean
  /** Set when the pick answered a return: the parked round's id. */
  readonly returnOf: string | null
}

export type Play = {
  readonly fileName: string
  readonly file: SessionFile
  readonly session: string
  readonly form: PlayForm
  readonly screen: string
  /** When the screen came into view, on the runtime's clock. */
  readonly shownAt: number
  readonly reveal: Reveal | null
  /** The round the reading in view was offered for, and how. */
  readonly placement: {
    readonly round: string
    readonly as: "placement" | "pointer"
  } | null
  /** The screen in view was asked for rather than offered (Prop. 9.4 (d)). */
  readonly asked: boolean
  readonly ended: "declared" | "left" | null
}

export type PlayInput =
  | { readonly type: "pick"; readonly option: number }
  | { readonly type: "continue" }
  | { readonly type: "show-confirmation" }
  | { readonly type: "act"; readonly action: number }
  | { readonly type: "open-source" }
  | { readonly type: "ask-return" }
  | { readonly type: "leave" }
  /** A spoken answer passed: its abstention, a struggle (Def. 9.4). */
  | { readonly type: "pass" }

export type StepContext = {
  /** Now, in epoch milliseconds. */
  readonly at: number
  readonly newId: () => string
  /** The learner's median selection time, or `null` before there is one. */
  readonly medianMs: number | null
}

export type Stepped = {
  readonly play: Play
  readonly events: ReadonlyArray<SessionEvent>
}

function roundNumber(screen: SessionScreen): number | null {
  for (const tag of screen.tags ?? []) {
    const match = /^round:(\d+)$/.exec(tag)
    if (match) return Number(match[1])
  }
  return null
}

/** The round `screen` returns, given the placement it was reached from. */
function returnOf(play: Play, screen: SessionScreen): string | null {
  if (screen.type !== "choice") return null
  if (screen.returnOf !== undefined) return screen.returnOf
  return screen.tags?.includes("parked-return") &&
    play.placement?.as === "placement"
    ? play.placement.round
    : null
}

/** The return the reading placed for `round` leads to, if the file authors one. */
export function returnScreenOf(
  file: SessionFile,
  round: string,
  reading: string
): string | null {
  const screen = file.screens[reading]
  if (screen?.type !== "reading") return null
  for (const action of screen.actions) {
    const next = action.next ? file.screens[action.next] : undefined
    if (
      next?.type === "choice" &&
      (next.returnOf ??
        (next.tags?.includes("parked-return") ? round : null)) === round
    ) {
      return action.next ?? null
    }
  }
  return null
}

/** The return the placement in view leads to, if the file authors one. */
export function returnFrom(play: Play): string | null {
  return play.placement?.as === "placement"
    ? returnScreenOf(play.file, play.placement.round, play.screen)
    : null
}

/** Median of the learner's earlier selection times, never the abstentions. */
export function medianSelectionMs(log: SessionLog): number | null {
  const times = log.flatMap((event) =>
    (event.type === "picked" || event.type === "returned") &&
    event.answer.response !== "abstained"
      ? [event.ms]
      : []
  )
  if (times.length < MEDIAN_AFTER) return null
  const sorted = [...times].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function stamp(
  play: Play,
  ctx: StepContext
): { id: string; at: string; session: string } {
  return {
    id: ctx.newId(),
    at: new Date(ctx.at).toISOString(),
    session: play.session,
  }
}

function firstTagged(file: SessionFile, tag: string): string | null {
  for (const [id, screen] of Object.entries(file.screens)) {
    if (screen.tags?.includes(tag)) return id
  }
  return null
}

function firstEnd(file: SessionFile): string | null {
  for (const [id, screen] of Object.entries(file.screens)) {
    if (screen.type === "end") return id
  }
  return null
}

/**
 * Brings `target` into view. The short form skips from its first incident
 * to the take; an end screen ends the session as declared.
 */
function enter(
  play: Play,
  target: string,
  ctx: StepContext,
  extra: Partial<Pick<Play, "placement" | "asked">> = {}
): Stepped {
  let screenId = target
  const screen = play.file.screens[screenId]
  if (play.form === "short" && screen) {
    const round = roundNumber(screen)
    if (round !== null && round >= 2) {
      screenId =
        firstTagged(play.file, "speak") ?? firstEnd(play.file) ?? screenId
    }
  }
  const next: Play = {
    ...play,
    screen: screenId,
    shownAt: ctx.at,
    reveal: null,
    placement: extra.placement ?? null,
    asked: extra.asked ?? false,
  }
  if (play.file.screens[screenId]?.type === "end") {
    return {
      play: { ...next, ended: "declared" },
      events: [
        {
          ...stamp(play, ctx),
          type: "ended",
          file: play.fileName,
          screen: screenId,
          how: "declared",
        },
      ],
    }
  }
  return { play: next, events: [] }
}

/**
 * Starts a session on its file's first screen, or, `returning`, on the
 * return of a round parked in an earlier session, offered because its
 * reading has since been read (Prop. 9.4 (b)).
 */
export function startPlay(
  args: {
    readonly fileName: string
    readonly file: SessionFile
    readonly session: string
    readonly form: PlayForm
    readonly returning?: { readonly round: string; readonly reading: string }
  },
  ctx: StepContext
): Stepped {
  const { returning, ...rest } = args
  const play: Play = {
    ...rest,
    screen: args.file.start,
    shownAt: ctx.at,
    reveal: null,
    placement: null,
    asked: false,
    ended: null,
  }
  const started: SessionEvent = {
    ...stamp(play, ctx),
    type: "started",
    file: args.fileName,
    form: args.form,
    declaredMinutes:
      args.form === "short"
        ? SHORT_FORM_MINUTES
        : args.file.session.budgetMinutes,
  }
  const placement = returning
    ? { round: returning.round, as: "placement" as const }
    : null
  const target = returning
    ? returnScreenOf(args.file, returning.round, returning.reading)
    : null
  const entered =
    target === null
      ? enter(play, args.file.start, ctx)
      : enter(play, target, ctx, { placement })
  return { play: entered.play, events: [started, ...entered.events] }
}

function pick(
  play: Play,
  screen: ChoiceScreen,
  option: number,
  ctx: StepContext
): Stepped {
  const picked = screen.options[option]
  if (!picked) return { play, events: [] }
  const ms = Math.max(0, ctx.at - play.shownAt)
  const slow = ctx.medianMs !== null && ms > 2 * ctx.medianMs
  const answer: Answer = picked.abstain
    ? { response: "abstained" }
    : { response: picked.correct ? "correct" : "incorrect", slow }
  const struggled = answer.response !== "correct" || answer.slow
  const parked = returnOf(play, screen)
  const on = { file: play.fileName, option: picked.label, ms, answer }
  const event: SessionEvent =
    parked === null
      ? { ...stamp(play, ctx), ...on, type: "picked", screen: play.screen }
      : {
          ...stamp(play, ctx),
          ...on,
          type: "returned",
          screen: parked,
          variant: play.screen,
          asked: play.asked,
        }
  return {
    play: {
      ...play,
      reveal: {
        option,
        answer,
        struggled,
        confirmation: !struggled,
        returnOf: parked,
      },
    },
    events: [event],
  }
}

/** Where a revealed pick goes on: a slow pick to `onHesitate`, if authored. */
function onward(screen: ChoiceScreen, reveal: Reveal): string | undefined {
  const option = screen.options[reveal.option]
  const slow = reveal.answer.response !== "abstained" && reveal.answer.slow
  return slow && screen.onHesitate !== undefined
    ? screen.onHesitate
    : option?.next
}

function carryOn(
  play: Play,
  screen: ChoiceScreen,
  reveal: Reveal,
  ctx: StepContext
): Stepped {
  const target = onward(screen, reveal)
  if (target === undefined) return { play, events: [] }
  const round = reveal.returnOf ?? play.screen
  const lands = play.file.screens[target]
  const events: Array<SessionEvent> = []
  let placement: Play["placement"] = null
  if (lands?.type === "reading") {
    const as = reveal.struggled ? "placement" : "pointer"
    events.push({
      ...stamp(play, ctx),
      type: "placed",
      file: play.fileName,
      screen: round,
      reading: target,
      as,
    })
    placement = { round, as }
  }
  // A return answered wrong is still parked; only a first struggle parks.
  if (reveal.struggled && reveal.returnOf === null) {
    events.push({
      ...stamp(play, ctx),
      type: "parked",
      file: play.fileName,
      screen: round,
    })
  }
  const entered = enter(play, target, ctx, { placement })
  return { play: entered.play, events: [...events, ...entered.events] }
}

function act(
  play: Play,
  screen: SessionScreen,
  index: number,
  ctx: StepContext
): Stepped {
  if (
    screen.type !== "info" &&
    screen.type !== "reading" &&
    screen.type !== "end"
  ) {
    return { play, events: [] }
  }
  const action = (screen.actions ?? [])[index]
  if (!action) return { play, events: [] }
  const events: Array<SessionEvent> = []
  if (screen.type === "reading") {
    events.push({
      ...stamp(play, ctx),
      type: "reading",
      file: play.fileName,
      reading: play.screen,
      action:
        action.effect === "read"
          ? "read"
          : action.effect === "save"
            ? "saved"
            : "skipped",
    })
  }
  if (action.next === null || action.next === undefined) {
    return {
      play: { ...play, ended: "declared" },
      events: [
        ...events,
        {
          ...stamp(play, ctx),
          type: "ended",
          file: play.fileName,
          screen: play.screen,
          how: "declared",
        },
      ],
    }
  }
  // A placement stays with the screen only into the return it leads to.
  const lands = play.file.screens[action.next]
  const entered = enter(play, action.next, ctx, {
    placement: lands && returnOf(play, lands) !== null ? play.placement : null,
  })
  return { play: entered.play, events: [...events, ...entered.events] }
}

export function step(play: Play, input: PlayInput, ctx: StepContext): Stepped {
  const unchanged: Stepped = { play, events: [] }
  if (play.ended !== null) return unchanged
  const screen = play.file.screens[play.screen]
  if (!screen) return unchanged
  switch (input.type) {
    case "pick": {
      if (screen.type !== "choice" || play.reveal !== null) return unchanged
      if (screen.options.some((option) => option.correct)) {
        return pick(play, screen, input.option, ctx)
      }
      // A choice with no correct option only chooses the way on.
      const next = screen.options[input.option]?.next
      return next === undefined ? unchanged : enter(play, next, ctx)
    }
    case "continue": {
      return screen.type === "choice" && play.reveal !== null
        ? carryOn(play, screen, play.reveal, ctx)
        : unchanged
    }
    case "show-confirmation": {
      const reveal = play.reveal
      if (screen.type !== "choice" || reveal === null || reveal.confirmation) {
        return unchanged
      }
      return {
        play: { ...play, reveal: { ...reveal, confirmation: true } },
        events: [
          {
            ...stamp(play, ctx),
            type: "confirmation-taken",
            file: play.fileName,
            screen: reveal.returnOf ?? play.screen,
          },
        ],
      }
    }
    case "act": {
      return act(play, screen, input.action, ctx)
    }
    case "open-source": {
      return screen.type === "reading"
        ? {
            play,
            events: [
              {
                ...stamp(play, ctx),
                type: "reading",
                file: play.fileName,
                reading: play.screen,
                action: "opened",
              },
            ],
          }
        : unchanged
    }
    case "ask-return": {
      const target = returnFrom(play)
      return target === null
        ? unchanged
        : enter(play, target, ctx, { placement: play.placement, asked: true })
    }
    case "pass": {
      if (screen.type !== "record") return unchanged
      const target = screen.onWeak ?? screen.next
      const events: Array<SessionEvent> = [
        {
          ...stamp(play, ctx),
          type: "spoken",
          file: play.fileName,
          screen: play.screen,
          answer: { as: "passed" },
        },
      ]
      let placement: Play["placement"] = null
      if (play.file.screens[target]?.type === "reading") {
        events.push({
          ...stamp(play, ctx),
          type: "placed",
          file: play.fileName,
          screen: play.screen,
          reading: target,
          as: "placement",
        })
        placement = { round: play.screen, as: "placement" }
      }
      const entered = enter(play, target, ctx, { placement })
      return { play: entered.play, events: [...events, ...entered.events] }
    }
    case "leave": {
      if (play.reveal !== null) return unchanged
      return {
        play: { ...play, ended: "left" },
        events: [
          {
            ...stamp(play, ctx),
            type: "ended",
            file: play.fileName,
            screen: play.screen,
            how: "left",
          },
        ],
      }
    }
    default: {
      return assertNever(input)
    }
  }
}
