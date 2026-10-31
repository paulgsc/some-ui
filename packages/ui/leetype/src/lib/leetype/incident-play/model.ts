import { isRound } from "@leetype/lib/leetype/session-file"
import type {
  SessionEvent,
  SessionLog,
} from "@leetype/lib/leetype/session-log/model"
import type {
  ChoiceScreen,
  RecordScreen,
  SessionFile,
  SessionScreen,
} from "@leetype/types/session-file"
import { edgesOf, rubricCovers, rubricText } from "@leetype/types/session-file"
import { assertNever, median } from "@some-ui/core-utils"

/**
 * Playing a session file (canon v1.2, Def. 1.9, Def. 9.3, Def. 9.4,
 * Def. 9.5, Prop. 9.4, Prop. 9.6): where the learner is in its graph of
 * screens, and what each input records. `step` is pure; the runtime
 * (`./index.ts`) owns the clock, the ids and the log the events go to.
 *
 * - A round's reveal follows its commitment. A correct, unhurried pick
 *   reveals the worked confirmation (every option's reason); a struggle
 *   reveals only what the picked option breaks, never which option is
 *   right, and its way on is a placement.
 * - A struggle that goes on into a reading places it and parks the round
 *   (a take too); a correct pick that goes on into one offers it as a
 *   pointer.
 * - A parked round's worked confirmation, the round itself and its return
 *   stay one action away (Prop. 9.4 (d)): from the reveal and the
 *   placement; at any round boundary, as a detour that comes back to the
 *   screen it left (`take-parked`); and across sessions, from the first
 *   screen (`startPlay`'s `from`). Taking any is recorded
 *   (`confirmationTaken` for the worked confirmation).
 * - The learner may leave at any round boundary: any screen not showing a
 *   reveal or a spoken answer's rubric (Prop. 9.6).
 * - A take's rubric states the answer of the rounds it covers, so showing
 *   it records `rubric-shown` for each (`rubricShown`, Rem. 11.10). A
 *   return after that or after the round's worked confirmation, until the
 *   round's next struggle, is assisted (`session-log`'s `summariesOf`).
 */

export type PlayForm = "full" | "short"

/**
 * Def. 9.5: aloud (a kept take), typed where the learner can't speak, or
 * passed, the commitment's abstention. Each is followed by the rubric.
 */
export type SpokenAnswer =
  | { readonly as: "recorded"; readonly take: string; readonly seconds: number }
  | { readonly as: "typed"; readonly text: string }
  | { readonly as: "passed" }

/** The short form: one incident and its take (Prop. 9.6). */
const SHORT_FORM_MINUTES = 5

/** A return or a replay taken from the first screen, on its own. */
const ONE_ROUND_MINUTES = 2

/** What a session declares it takes (Prop. 9.6), never past the host's time. */
export function declaredMinutes(
  file: SessionFile,
  form: PlayForm,
  oneRound: boolean,
  limitMinutes?: number
): number {
  const wants = oneRound
    ? ONE_ROUND_MINUTES
    : form === "short"
      ? SHORT_FORM_MINUTES
      : file.session.budgetMinutes
  return limitMinutes === undefined
    ? wants
    : Math.max(1, Math.min(wants, Math.floor(limitMinutes)))
}

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

type Placement = {
  readonly round: string
  readonly as: "placement" | "pointer"
}

type Resume = Pick<Play, "scope" | "screen" | "placement" | "placing" | "asked">

/** A parked round taken: its return, or the round itself (Prop. 9.4 (d)). */
export type TakeParked = {
  readonly round: string
  /** The reading it waits on, which leads to its return. */
  readonly reading: string | null
  readonly take: "return" | "round"
  /** Taken before its reading was read, so asked for, not offered. */
  readonly asked: boolean
}

export type Play = {
  readonly fileName: string
  readonly file: SessionFile
  readonly session: string
  readonly form: PlayForm
  /**
   * `"file"` walks the file; `"round"` is one parked round taken, its
   * return or itself, with its own placement, then `resume`, or the end.
   */
  readonly scope: "file" | "round"
  readonly screen: string
  /** When the screen came into view, on the runtime's clock. */
  readonly shownAt: number
  readonly reveal: Reveal | null
  /** The round the reading in view was offered for, and how. */
  readonly placement: Placement | null
  /**
   * A placement on its way to its reading through info screens: placed
   * when the reading comes into view.
   */
  readonly placing: Placement | null
  /** Where a detour to a parked round comes back to once it is done. */
  readonly resume: Resume | null
  /** The screen in view was asked for rather than offered (Prop. 9.4 (d)). */
  readonly asked: boolean
  /** A spoken answer given on the record screen in view, before its rubric. */
  readonly spoken: SpokenAnswer | null
  /** Rounds played this session, returns aside: the short form plays one. */
  readonly rounds: number
  /** Rounds parked this session, which a rubric with no `covers` covers. */
  readonly parkedHere: ReadonlyArray<string>
  readonly ended: "declared" | "left" | null
}

export type PlayInput =
  | { readonly type: "pick"; readonly option: number }
  | { readonly type: "continue" }
  | { readonly type: "show-confirmation" }
  | { readonly type: "act"; readonly action: number }
  | { readonly type: "open-source" }
  | { readonly type: "ask-return" }
  /** A parked round taken at a round boundary, as a detour. */
  | ({ readonly type: "take-parked" } & TakeParked)
  | { readonly type: "leave" }
  /** A spoken answer passed: its abstention, a struggle (Def. 9.4). */
  | { readonly type: "pass" }
  /** A spoken answer given; its rubric shows next (Ax. 9.2). */
  | { readonly type: "answered"; readonly answer: SpokenAnswer }
  /** The rubric points the learner ticks for their answer. */
  | { readonly type: "ticked"; readonly ticks: ReadonlyArray<string> }

export type StepContext = {
  /** Now, in epoch milliseconds. */
  readonly at: number
  readonly newId: () => string
  /** The learner's median selection time, or `null` before there is one. */
  readonly medianMs: number | null
  /**
   * How long the app was in the background since the screen came into
   * view: it is not time the learner took to choose.
   */
  readonly hiddenMs: number
}

export type Stepped = {
  readonly play: Play
  readonly events: ReadonlyArray<SessionEvent>
}

/**
 * The round `screen` returns, given the placement it was reached from: its
 * own `returnOf`, or, tagged `parked-return`, the round the placement in
 * view was placed for, when that is a round.
 */
function returnOf(play: Play, screen: SessionScreen): string | null {
  if (screen.type !== "choice") return null
  if (screen.returnOf !== undefined) return screen.returnOf
  const placed = play.placement
  if (!screen.tags?.includes("parked-return") || placed?.as !== "placement") {
    return null
  }
  return isRoundId(play.file, placed.round) ? placed.round : null
}

function isRoundId(file: SessionFile, id: string): boolean {
  const screen = file.screens[id]
  return screen !== undefined && isRound(screen)
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
    // Inferred from the tag only for a round, as `returnOf` does.
    const inferred =
      next?.tags?.includes("parked-return") === true && isRoundId(file, round)
    if (
      next?.type === "choice" &&
      (next.returnOf ?? (inferred ? round : null)) === round
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
  return times.length < MEDIAN_AFTER ? null : median(times)
}

function stamp(
  play: Pick<Play, "session">,
  ctx: Pick<StepContext, "at" | "newId">
): { id: string; at: string; session: string } {
  return {
    id: ctx.newId(),
    at: new Date(ctx.at).toISOString(),
    session: play.session,
  }
}

/**
 * The first take reachable from `from`, `from` included: a record screen,
 * or the choice tagged `speak` that leads to one.
 */
function nextTake(file: SessionFile, from: string): string | null {
  const seen = new Set<string>()
  const queue = [from]
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const screen = file.screens[id]
    if (!screen || seen.has(id)) continue
    seen.add(id)
    if (screen.type === "record" || screen.tags?.includes("speak")) return id
    queue.push(...edgesOf(screen))
  }
  return null
}

function firstEnd(file: SessionFile): string | null {
  for (const [id, screen] of Object.entries(file.screens)) {
    if (screen.type === "end") return id
  }
  return null
}

function ended(play: Play, screen: string, ctx: StepContext): Stepped {
  return {
    play: { ...play, screen, reveal: null, spoken: null, ended: "declared" },
    events: [
      {
        ...stamp(play, ctx),
        type: "ended",
        file: play.fileName,
        screen,
        how: "declared",
      },
    ],
  }
}

/**
 * A parked round in view, its return or itself, with the screen it left
 * kept to come back to. A detour taken during a detour comes back to where
 * the first one left.
 */
function detour(play: Play, take: TakeParked): Play {
  const back =
    take.take === "return" && take.reading !== null
      ? returnScreenOf(play.file, take.round, take.reading)
      : null
  const { scope, screen, placement, placing, asked } = play
  return {
    ...play,
    scope: "round",
    screen: back ?? take.round,
    reveal: null,
    placement: back === null ? null : { round: take.round, as: "placement" },
    placing: null,
    asked: take.asked,
    spoken: null,
    resume: play.resume ?? { scope, screen, placement, placing, asked },
  }
}

/**
 * Goes on into `target` from a round placed for `placing.round`: a reading
 * is placed as it comes into view, and an info screen on the way carries
 * the placement to it. `also` is recorded after the placement.
 */
function arrive(
  play: Play,
  target: string,
  ctx: StepContext,
  placing: Placement,
  also: ReadonlyArray<SessionEvent> = []
): Stepped {
  const lands = play.file.screens[target]
  if (lands?.type === "reading") {
    const entered = enter(play, target, ctx, { placement: placing })
    return {
      play: entered.play,
      events: [
        {
          ...stamp(play, ctx),
          type: "placed",
          file: play.fileName,
          screen: placing.round,
          reading: target,
          as: placing.as,
        },
        ...also,
        ...entered.events,
      ],
    }
  }
  const entered = enter(
    play,
    target,
    ctx,
    lands?.type === "info" ? { placing } : {}
  )
  return { play: entered.play, events: [...also, ...entered.events] }
}

/**
 * Brings `target` into view. The short form plays one round: a second one
 * gives way to the next take on from it, or the end. A parked round taken
 * on its own is done once it and its placement are: the detour comes back
 * to the screen it left, or, taken from the first screen, the session
 * ends. An end screen ends the session as declared.
 */
function enter(
  play: Play,
  target: string,
  ctx: StepContext,
  extra: Partial<Pick<Play, "placement" | "placing" | "asked">> = {}
): Stepped {
  const placement = extra.placement ?? null
  const placing = extra.placing ?? null
  const screen = play.file.screens[target]
  const arriving = { ...play, placement }
  const freshRound =
    screen !== undefined &&
    isRound(screen) &&
    returnOf(arriving, screen) === null
  if (
    play.scope === "round" &&
    screen?.type !== "reading" &&
    placement === null &&
    placing === null
  ) {
    const back = play.resume
    if (back === null) return ended(play, play.screen, ctx)
    const resumed: Play = {
      ...play,
      ...back,
      shownAt: ctx.at,
      reveal: null,
      spoken: null,
      resume: null,
    }
    return { play: resumed, events: [] }
  }
  if (play.form === "short" && freshRound && play.rounds >= 1) {
    const take = nextTake(play.file, target)
    const to = take ?? firstEnd(play.file)
    return to === null || to === target
      ? ended(play, play.screen, ctx)
      : enter(play, to, ctx)
  }
  const next: Play = {
    ...play,
    screen: target,
    shownAt: ctx.at,
    reveal: null,
    placement,
    placing,
    asked: extra.asked ?? false,
    spoken: null,
    rounds: play.rounds + (freshRound ? 1 : 0),
  }
  return screen?.type === "end"
    ? ended(next, target, ctx)
    : { play: next, events: [] }
}

/**
 * Starts a session on its file's first screen, or, `from`, on one parked
 * round taken from the first screen (Prop. 9.4 (d)): its return, offered
 * once its reading was read or asked for before, or the round itself.
 */
export function startPlay(
  args: {
    readonly fileName: string
    readonly file: SessionFile
    readonly session: string
    readonly form: PlayForm
    /** The most the host's time leaves, in minutes: the length is no longer. */
    readonly limitMinutes?: number
    readonly from?: TakeParked
  },
  ctx: StepContext
): Stepped {
  const { from, limitMinutes, ...rest } = args
  const play: Play = {
    ...rest,
    scope: from ? "round" : "file",
    screen: args.file.start,
    shownAt: ctx.at,
    reveal: null,
    placement: null,
    placing: null,
    resume: null,
    asked: false,
    spoken: null,
    rounds: 0,
    parkedHere: [],
    ended: null,
  }
  const started: SessionEvent = {
    ...stamp(play, ctx),
    type: "started",
    file: args.fileName,
    form: args.form,
    declaredMinutes: declaredMinutes(
      args.file,
      args.form,
      from !== undefined,
      limitMinutes
    ),
  }
  // Taken from the first screen, it has nothing to come back to.
  if (from) {
    return { play: { ...detour(play, from), resume: null }, events: [started] }
  }
  const entered = enter(play, args.file.start, ctx)
  return { play: entered.play, events: [started, ...entered.events] }
}

/**
 * A parked round's worked confirmation, taken from the first screen
 * (Prop. 9.4 (d)): recorded in the session the first screen opened.
 */
export function confirmationTaken(
  args: {
    readonly session: string
    readonly file: string
    readonly round: string
  },
  ctx: Pick<StepContext, "at" | "newId">
): SessionEvent {
  return {
    ...stamp(args, ctx),
    type: "confirmation-taken",
    file: args.file,
    screen: args.round,
  }
}

/**
 * A take's rubric shown (Def. 9.5: after the answer, or the pass): one
 * `rubric-shown` for each round it states the answer of (Rem. 11.10). Its
 * points' `covers` name them; a rubric whose points name none is read as
 * covering every round parked in the session showing it (`parkedHere`).
 * Whether a covered round was parked then is the log's to say: a return
 * is assisted only by a rubric shown since the round's last struggle.
 */
export function rubricShown(
  args: {
    readonly session: string
    readonly file: string
    readonly take: string
    readonly screen: RecordScreen
    readonly parkedHere: ReadonlyArray<string>
  },
  ctx: Pick<StepContext, "at" | "newId">
): Array<SessionEvent> {
  const covered = rubricCovers(args.screen) ?? args.parkedHere
  return [...new Set(covered)].map((round) => ({
    ...stamp(args, ctx),
    type: "rubric-shown",
    file: args.file,
    screen: round,
    take: args.take,
  }))
}

/** The rubric of the record screen in view comes into view after `spoken`. */
function showRubric(
  play: Play,
  screen: RecordScreen,
  spoken: SpokenAnswer,
  ctx: StepContext
): Stepped {
  return {
    play: { ...play, spoken },
    events: rubricShown(
      {
        session: play.session,
        file: play.fileName,
        take: play.screen,
        screen,
        parkedHere: play.parkedHere,
      },
      ctx
    ),
  }
}

function pick(
  play: Play,
  screen: ChoiceScreen,
  option: number,
  ctx: StepContext
): Stepped {
  const picked = screen.options[option]
  if (!picked) return { play, events: [] }
  const ms = Math.max(0, ctx.at - play.shownAt - ctx.hiddenMs)
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
  // A return answered wrong is still parked; only a first struggle parks.
  const parks: Array<SessionEvent> =
    reveal.struggled && reveal.returnOf === null
      ? [
          {
            ...stamp(play, ctx),
            type: "parked",
            file: play.fileName,
            screen: round,
          },
        ]
      : []
  const parkedHere =
    parks.length > 0 ? [...play.parkedHere, round] : play.parkedHere
  return arrive(
    { ...play, parkedHere },
    target,
    ctx,
    { round, as: reveal.struggled ? "placement" : "pointer" },
    parks
  )
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
  const actions = screen.actions ?? []
  const action = actions[index]
  if (!action) return { play, events: [] }
  const events: Array<SessionEvent> = []
  // A reading's choice is recorded where it offers one: read, save, or not.
  if (screen.type === "reading" && actions.some((one) => one.effect)) {
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
    const done = ended(play, play.screen, ctx)
    return { play: done.play, events: [...events, ...done.events] }
  }
  if (play.placing !== null) {
    const arrived = arrive(play, action.next, ctx, play.placing)
    return { play: arrived.play, events: [...events, ...arrived.events] }
  }
  // A placement stays with the screen only into the return it leads to.
  const lands = play.file.screens[action.next]
  const entered = enter(play, action.next, ctx, {
    placement: lands && returnOf(play, lands) !== null ? play.placement : null,
  })
  return { play: entered.play, events: [...events, ...entered.events] }
}

type Spoken = Extract<SessionEvent, { type: "spoken" }>["answer"]

/**
 * A spoken answer settled: a pass, or fewer ticks than the screen asks, is
 * a struggle that goes to `onWeak`, places its reading and parks the take
 * (Def. 9.4, Prop. 9.4).
 */
function speak(
  play: Play,
  screen: RecordScreen,
  answer: Spoken,
  ctx: StepContext
): Stepped {
  const weak = answer.as === "passed" || !answer.strong
  const target = weak ? (screen.onWeak ?? screen.next) : screen.next
  const events: Array<SessionEvent> = [
    {
      ...stamp(play, ctx),
      type: "spoken",
      file: play.fileName,
      screen: play.screen,
      answer,
    },
  ]
  if (!weak) {
    const entered = enter(play, target, ctx)
    return { play: entered.play, events: [...events, ...entered.events] }
  }
  const arrived = arrive(
    play,
    target,
    ctx,
    { round: play.screen, as: "placement" },
    [
      {
        ...stamp(play, ctx),
        type: "parked",
        file: play.fileName,
        screen: play.screen,
      },
    ]
  )
  return { play: arrived.play, events: [...events, ...arrived.events] }
}

/**
 * A choice with no correct option only chooses the way on. On a take's
 * choice, its abstention ("No take today") is the spoken answer's pass.
 */
function choose(
  play: Play,
  screen: ChoiceScreen,
  index: number,
  ctx: StepContext
): Stepped {
  const option = screen.options[index]
  if (!option) return { play, events: [] }
  const entered = enter(play, option.next, ctx)
  if (!option.abstain || !screen.tags?.includes("speak")) return entered
  return {
    play: entered.play,
    events: [
      {
        ...stamp(play, ctx),
        type: "spoken",
        file: play.fileName,
        screen: play.screen,
        answer: { as: "passed" },
      },
      ...entered.events,
    ],
  }
}

export function step(play: Play, input: PlayInput, ctx: StepContext): Stepped {
  const unchanged: Stepped = { play, events: [] }
  if (play.ended !== null) return unchanged
  const screen = play.file.screens[play.screen]
  if (!screen) return unchanged
  switch (input.type) {
    case "pick": {
      if (screen.type !== "choice" || play.reveal !== null) return unchanged
      return isRound(screen)
        ? pick(play, screen, input.option, ctx)
        : choose(play, screen, input.option, ctx)
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
          confirmationTaken(
            {
              session: play.session,
              file: play.fileName,
              round: reveal.returnOf ?? play.screen,
            },
            ctx
          ),
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
      return screen.type === "record" && play.spoken === null
        ? showRubric(play, screen, { as: "passed" }, ctx)
        : unchanged
    }
    case "answered": {
      return screen.type === "record" && play.spoken === null
        ? showRubric(play, screen, input.answer, ctx)
        : unchanged
    }
    case "ticked": {
      const spoken = play.spoken
      if (screen.type !== "record" || spoken === null) return unchanged
      const points = rubricText(screen)
      const ticks = input.ticks.filter((tick) => points.includes(tick))
      const strong = ticks.length >= screen.weakIfFewerThan
      return speak(
        play,
        screen,
        spoken.as === "recorded"
          ? { as: "recorded", seconds: spoken.seconds, ticks, strong }
          : spoken.as === "typed"
            ? { as: "typed", ticks, strong }
            : { as: "passed" },
        ctx
      )
    }
    case "take-parked": {
      if (play.reveal !== null || play.spoken !== null) return unchanged
      // The round, or its return, in view is already being played.
      const takes =
        input.take === "round"
          ? input.round
          : input.reading === null
            ? null
            : returnScreenOf(play.file, input.round, input.reading)
      if (takes === play.screen) return unchanged
      const { round, reading, take, asked } = input
      const away = detour(play, { round, reading, take, asked })
      return { play: { ...away, shownAt: ctx.at }, events: [] }
    }
    case "leave": {
      if (play.reveal !== null || play.spoken !== null) return unchanged
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
