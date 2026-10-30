/**
 * The Studio screens as one state machine: Start, Record and Done for now
 * (STUDIO ST4) over a project (`lib/project/model.ts`). `step(state, event)`
 * returns the next state and the effects to run, and does nothing else;
 * `runtime.ts` runs the effects against the store, the microphone, `Audio`
 * and the picked file, and the component renders a state and turns taps into
 * events (docs/monorepo-boundaries.md, "Inside a React package").
 *
 * Rules that hold by structure:
 *
 * - **The project shown is the project kept.** A change is a `Pending` write
 *   queued in order and applied to the project as the store holds it when its
 *   turn comes; the state adopts it only once the write lands. One write is
 *   in flight at a time, so no write is built on another that may yet be
 *   refused.
 * - **A refused write kept nothing, and says so.** The store is read again,
 *   the notice says what wasn't kept and what to do (a full phone: share the
 *   takes, say they arrived), and the queue goes on from what the store holds.
 * - **One activity at a time.** Playing, opening the microphone, recording
 *   and keeping a take are arms of one union.
 * - **A scene runs its take and a breath.** Keeping a take writes, in the
 *   same write, a revision fitting its scene to it (`project/script.ts`).
 * - **Done for now keeps the take under way first.** The sitting closes
 *   after the take is kept or has failed, so its log counts it, and it
 *   records the scene on screen: the next sitting opens there.
 * - **Nothing records while the page is off screen.** A take recording when
 *   the page is hidden or left is finished and kept; a microphone that opens
 *   then, or once the Record screen is gone, is let go.
 */
import { assertNever } from "@some-ui/core-utils"
import type { RecordingFailure, Take, TakePhase } from "@some-ui/voice-capture"
import {
  discardTake,
  finishTake,
  openTake,
  stepTake,
} from "@some-ui/voice-capture"
import type { Primer } from "@soundbites/lib/journal/primer"
import { readPrimer } from "@soundbites/lib/journal/primer"
import { SOUNDBITE_MIN_MS } from "@soundbites/lib/policy"
import type { Project, ProjectTake } from "@soundbites/lib/project/model"
import {
  latest,
  newProject,
  step as stepProject,
} from "@soundbites/lib/project/model"
import {
  capFor,
  currentOf,
  cutListOf,
  fitted,
  projectIdFor,
  resumeAt,
  scriptOf,
} from "@soundbites/lib/project/script"
import type { Friction } from "@soundbites/lib/project/store"

import { sceneBeside } from "./view"
import type { Went } from "./words"
import { STUDIO_WORDS } from "./words"

const WORDS = STUDIO_WORDS

/** What a take is for, fixed as it opens. */
type TakeFor = {
  readonly shot: string
  readonly capMs: number
  readonly project: string
}

export type StudioActivity =
  | { readonly kind: "idle" }
  | { readonly kind: "playing"; readonly take: string; readonly seq: number }
  | ({ readonly kind: "opening" } & TakeFor)
  | ({
      readonly kind: "recording"
      readonly startedAt: number
      readonly elapsed: number
      readonly level: number
    } & TakeFor)
  /** Stopped, and being kept: until its write lands or is refused. */
  | ({ readonly kind: "saving" } & TakeFor)

type StudioScreen =
  | { readonly kind: "start" }
  | { readonly kind: "record"; readonly shot: string }
  | {
      readonly kind: "done"
      readonly step: "how" | "what" | "saved"
      readonly went: Went | null
      /** The sitting it asks about, by project and id. */
      readonly project: string
      readonly sitting: string | null
      readonly shot: string
    }

type Shelf =
  | { readonly kind: "reading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "read"; readonly project: Project | null }

/** A write waiting its turn, applied to the project as kept when it starts. */
type Pending =
  | { readonly kind: "create"; readonly primer: Primer; readonly at: string }
  | { readonly kind: "revise"; readonly primer: Primer; readonly at: string }
  | { readonly kind: "open"; readonly at: string }
  | {
      readonly kind: "keep"
      readonly project: string
      readonly take: Pick<
        ProjectTake,
        "shot" | "recordedAt" | "durationMs" | "mimeType"
      >
      readonly audio: Blob
    }
  | { readonly kind: "close"; readonly at: string; readonly shot: string }
  | { readonly kind: "arrived"; readonly takes: ReadonlyArray<string> }

export type StudioState = {
  readonly page: "new" | "here" | "left"
  readonly visible: boolean
  readonly shelf: Shelf
  readonly screen: StudioScreen
  readonly activity: StudioActivity
  /** Why the microphone last refused, until the next try. */
  readonly blocked: RecordingFailure | null
  readonly notice: string
  /** What is wrong with the primer file last picked, until the next pick. */
  readonly primerProblem: string | null
  /** A primer read while a video is open: a new version of it, or a new one? */
  readonly choosing: { readonly primer: Primer; readonly at: string } | null
  readonly queue: ReadonlyArray<Pending>
  readonly inFlight: {
    readonly pending: Pending
    readonly project: Project
  } | null
  /** Done for now, waiting on the take under way before the sitting closes. */
  readonly closing: { readonly at: string; readonly shot: string } | null
  /** Whether the Done screen's sitting is saved yet. */
  readonly closed: "saving" | "saved" | "failed" | null
  readonly readSeq: number
  readonly pickSeq: number
  readonly playSeq: number
}

/** What the person does. The runtime stamps each with when (`at`). */
export type StudioIntent =
  | { readonly type: "primerPicked"; readonly file: Blob }
  | {
      readonly type: "versionChosen"
      readonly as: "next" | "new" | "cancel"
    }
  | { readonly type: "recordChosen" }
  | { readonly type: "recordPressed" }
  | { readonly type: "discardPressed" }
  | { readonly type: "keepNextPressed" }
  | { readonly type: "previousPressed" }
  | { readonly type: "playPressed" }
  | { readonly type: "doneForNowPressed" }
  | { readonly type: "wentChosen"; readonly went: Went }
  | { readonly type: "snagTold"; readonly text: string }
  | { readonly type: "notYetPressed" }
  | { readonly type: "takesArrived"; readonly takes: ReadonlyArray<string> }
  | { readonly type: "retryRead" }

/** What the page, the clock and the ports report. */
type StudioSignal =
  | { readonly type: "entered"; readonly at: string }
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | { readonly type: "shown" }
  | { readonly type: "carried"; readonly title: string | null }
  | { readonly type: "carryFailed" }
  | { readonly type: "ticked"; readonly now: number; readonly level: number }
  | { readonly type: "micOpened"; readonly at: number }
  | { readonly type: "micFailed"; readonly reason: RecordingFailure }
  | { readonly type: "taken"; readonly take: Take; readonly at: string }
  | { readonly type: "takeFailed" }
  | {
      readonly type: "listed"
      readonly seq: number
      readonly projects: ReadonlyArray<Project>
    }
  | { readonly type: "listFailed"; readonly seq: number }
  | {
      readonly type: "primerRead"
      readonly seq: number
      readonly text: string
      readonly at: string
    }
  | { readonly type: "primerUnreadable"; readonly seq: number }
  | { readonly type: "written" }
  | { readonly type: "writeFailed"; readonly reason: "full" | "failed" }
  | { readonly type: "reported" }
  | { readonly type: "reportFailed" }
  | { readonly type: "audioLoaded"; readonly seq: number; readonly audio: Blob }
  | { readonly type: "audioMissing"; readonly seq: number }
  | { readonly type: "audioUnreadable"; readonly seq: number }
  | { readonly type: "playbackEnded"; readonly seq: number }

export type StudioEvent =
  | (StudioIntent & { readonly at: string })
  | StudioSignal

export type StudioEffect =
  | { readonly type: "openMic" }
  | { readonly type: "finishTake" }
  | { readonly type: "discardTake" }
  | { readonly type: "startClock" }
  | { readonly type: "stopClock" }
  | { readonly type: "carry"; readonly at: string }
  | { readonly type: "read"; readonly seq: number }
  | { readonly type: "readFile"; readonly file: Blob; readonly seq: number }
  | { readonly type: "save"; readonly project: Project }
  | {
      readonly type: "keepTake"
      readonly project: Project
      readonly take: string
      readonly audio: Blob
    }
  | { readonly type: "report"; readonly friction: Friction }
  | {
      readonly type: "loadAudio"
      readonly project: string
      readonly take: string
      readonly seq: number
    }
  | {
      readonly type: "startPlayback"
      readonly audio: Blob
      readonly seq: number
    }
  | { readonly type: "stopPlayback" }

export type Step = {
  readonly state: StudioState
  readonly effects: ReadonlyArray<StudioEffect>
}

export function initialStudioState(): StudioState {
  return {
    page: "new",
    visible: true,
    shelf: { kind: "reading" },
    screen: { kind: "start" },
    activity: { kind: "idle" },
    blocked: null,
    notice: "",
    primerProblem: null,
    choosing: null,
    queue: [],
    inFlight: null,
    closing: null,
    closed: null,
    readSeq: 0,
    pickSeq: 0,
    playSeq: 0,
  }
}

/** Whether a take is opening, under way or not yet kept. */
function isTaking(activity: StudioActivity): boolean {
  return (
    activity.kind === "opening" ||
    activity.kind === "recording" ||
    activity.kind === "saving"
  )
}

/** Whether the screen's controls take a tap. */
export function isSettled(activity: StudioActivity): boolean {
  return activity.kind === "idle" || activity.kind === "playing"
}

const stay = (state: StudioState): Step => ({ state, effects: [] })

function projectOf(state: StudioState): Project | null {
  return state.shelf.kind === "read" ? state.shelf.project : null
}

function read(state: StudioState): Step {
  const seq = state.readSeq + 1
  return { state: { ...state, readSeq: seq }, effects: [{ type: "read", seq }] }
}

/** Every take recorded since the open sitting began, as scene numbers. */
function scenesTaken(project: Project): Array<number> {
  const sitting = project.sittings.at(-1)
  if (sitting?.closedAt !== null) return []
  const { shots } = latest(project).cutList
  const numbers = project.takes
    .filter((take) => take.recordedAt >= sitting.openedAt)
    .map((take) => shots.findIndex((shot) => shot.id === take.shot) + 1)
    .filter((n) => n > 0)
  return [...new Set(numbers)].sort((a, b) => a - b)
}

/** The project `pending` makes of `project`, or null when it changes nothing. */
function applied(project: Project | null, pending: Pending): Project | null {
  const model = (
    at: Project,
    event: Parameters<typeof stepProject>[1],
    taking: string | null = null
  ): Project | null => {
    const next = stepProject(
      {
        project: at,
        taking: taking === null ? null : { shot: taking },
        closing: null,
      },
      event
    )
    return next.refused === null ? next.state.project : null
  }
  switch (pending.kind) {
    case "create": {
      const { primer, at } = pending
      return newProject(projectIdFor(primer.title, at), {
        author: "claude",
        message: `Primer: ${primer.title}`,
        at,
        cutList: cutListOf(primer),
        primer,
      }).project
    }
    case "revise": {
      if (project === null) return null
      const { primer, at } = pending
      return model(project, {
        type: "revised",
        author: "claude",
        message: `Primer: ${primer.title}`,
        at,
        cutList: cutListOf(primer, {
          cutList: latest(project).cutList,
          project,
        }),
        primer,
      })
    }
    case "open": {
      if (project === null) return null
      return model(project, {
        type: "sittingOpened",
        id: `s${project.sittings.length + 1}`,
        at: pending.at,
      })
    }
    case "keep": {
      if (project?.id !== pending.project) return null
      const take = { ...pending.take, id: `t${project.takes.length + 1}` }
      const withTake = model(project, { type: "taken", take }, take.shot)
      if (withTake === null) return null
      const { shots } = latest(withTake).cutList
      const n = shots.findIndex((shot) => shot.id === take.shot) + 1
      return model(withTake, {
        type: "revised",
        author: "owner",
        message: `Scene ${n} runs its take`,
        at: take.recordedAt,
        cutList: fitted(latest(withTake).cutList, take.shot, take),
      })
    }
    case "close": {
      if (project === null) return null
      const { scenes } = scriptOf(project)
      const next = scenes.find(
        (scene) => project.chosen[scene.shot.id] === undefined
      )
      return model(project, {
        type: "sittingClosed",
        at: pending.at,
        done: WORDS.sittingDone(scenesTaken(project)),
        next: WORDS.sittingNext(
          next === undefined
            ? null
            : {
                n: scenes.indexOf(next) + 1,
                artifact: next.cut?.artifact ?? next.shot.id,
              }
        ),
        shot: pending.shot,
      })
    }
    case "arrived": {
      if (project === null) return null
      const after = pending.takes.reduce<Project>((at, take) => {
        const kept = model(at, { type: "keptBy", take, keeper: "drive" }) ?? at
        return model(kept, { type: "letGo", take }) ?? kept
      }, project)
      return after === project ? null : after
    }
    default: {
      return assertNever(pending)
    }
  }
}

/**
 * Starts the next write if none is in flight: the first pending one that
 * changes the project as kept. A Done for now waits here until no take is
 * under way.
 */
function pump(state: StudioState): Step {
  let at = state
  if (at.closing !== null && !isTaking(at.activity)) {
    at = {
      ...at,
      queue: [...at.queue, { kind: "close", ...at.closing }],
      closing: null,
    }
  }
  if (at.inFlight !== null || at.shelf.kind !== "read") return stay(at)
  const [pending, ...queue] = at.queue
  if (pending === undefined) return stay(at)
  const project = applied(at.shelf.project, pending)
  if (project === null) {
    // A take with nowhere to go is said, never dropped silently; a sitting
    // with none open to close says where the next one opens instead.
    return pump({
      ...at,
      queue,
      ...(pending.kind === "keep"
        ? { notice: WORDS.notice.notKept, activity: { kind: "idle" } }
        : {}),
      ...(pending.kind === "close" ? { closed: "failed" } : {}),
    })
  }
  const effect: StudioEffect =
    pending.kind === "keep"
      ? {
          type: "keepTake",
          project,
          take: project.takes.at(-1)?.id ?? "",
          audio: pending.audio,
        }
      : { type: "save", project }
  return {
    state: { ...at, queue, inFlight: { pending, project } },
    effects: [effect],
  }
}

function enqueue(state: StudioState, pending: Pending): Step {
  return pump({ ...state, queue: [...state.queue, pending] })
}

/** What a landed write says. */
function landedNotice(state: StudioState, pending: Pending): string {
  switch (pending.kind) {
    case "keep": {
      return WORDS.notice.kept(pending.take.durationMs)
    }
    case "create": {
      return WORDS.start.opened(pending.primer.title)
    }
    case "revise": {
      return WORDS.start.revised(pending.primer.title)
    }
    case "arrived": {
      return WORDS.notice.arrived(pending.takes.length)
    }
    case "open":
    case "close": {
      return state.notice
    }
    default: {
      return assertNever(pending)
    }
  }
}

/** What a refused write says it didn't keep. */
function refusedNotice(pending: Pending, reason: "full" | "failed"): string {
  if (pending.kind === "keep")
    return reason === "full" ? WORDS.notice.full : WORDS.notice.notKept
  return WORDS.notice.notSaved
}

/** The screen once the project changed under it: its scene, if still there. */
function placed(screen: StudioScreen, project: Project | null): StudioScreen {
  if (screen.kind !== "record") return screen
  if (project === null) return { kind: "start" }
  const there = latest(project).cutList.shots.some(
    (shot) => shot.id === screen.shot
  )
  return there ? screen : { kind: "record", shot: resumeAt(project) }
}

function withProject(state: StudioState, project: Project | null): StudioState {
  return {
    ...state,
    shelf: { kind: "read", project },
    screen: placed(state.screen, project),
  }
}

function finishRecording(state: StudioState): Step {
  if (state.activity.kind !== "recording") return stay(state)
  const next = finishTake(state.activity)
  return next.kind === "taking"
    ? taking(state, takeFor(state.activity), next.phase, next.effects)
    : stay(state)
}

function takeFor(activity: TakeFor): TakeFor {
  return {
    shot: activity.shot,
    capMs: activity.capMs,
    project: activity.project,
  }
}

function taking(
  state: StudioState,
  take: TakeFor,
  phase: TakePhase,
  effects: Step["effects"]
): Step {
  const shown: StudioActivity =
    phase.kind === "finishing"
      ? { kind: "saving", ...take }
      : phase.kind === "opening"
        ? { kind: "opening", ...take }
        : { ...phase, ...take }
  return { state: { ...state, activity: shown }, effects }
}

const FINISHING: TakePhase = { kind: "finishing" }

function limitsOf(take: TakeFor): { minMs: number; maxMs: number } {
  return { minMs: SOUNDBITE_MIN_MS, maxMs: take.capMs }
}

function stopPlay(state: StudioState, notice?: string): Step {
  return {
    state: {
      ...state,
      activity: { kind: "idle" },
      notice: notice ?? state.notice,
    },
    effects: [{ type: "stopPlayback" }],
  }
}

function isCurrentPlay(state: StudioState, seq: number): boolean {
  return state.activity.kind === "playing" && state.activity.seq === seq
}

/** `then` from `state` once any playback is stopped; nothing while taking. */
function settledOnly(
  state: StudioState,
  then: (settled: StudioState) => Step
): Step {
  if (!isSettled(state.activity)) return stay(state)
  if (state.activity.kind !== "playing") return then(state)
  const stopped = stopPlay(state)
  const next = then(stopped.state)
  return { state: next.state, effects: [...stopped.effects, ...next.effects] }
}

/** Moves the Record screen to another scene, if there is one. */
function moveTo(state: StudioState, shot: string | null): Step {
  if (shot === null || state.screen.kind !== "record") return stay(state)
  return settledOnly(state, (settled) =>
    stay({
      ...settled,
      screen: { kind: "record", shot },
      notice: "",
      blocked: null,
    })
  )
}

function doneForNow(state: StudioState, at: string): Step {
  const project = projectOf(state)
  if (state.screen.kind !== "record" || project === null) return stay(state)
  const sitting = project.sittings.at(-1)
  const open = sitting?.closedAt === null ? sitting : null
  const screen: StudioScreen = {
    kind: "done",
    step: "how",
    went: null,
    project: project.id,
    sitting: open?.id ?? null,
    shot: state.screen.shot,
  }
  const base: StudioState = {
    ...state,
    screen,
    closed: "saving",
    closing: { at, shot: state.screen.shot },
  }
  if (state.activity.kind === "recording") {
    const finished = finishRecording(base)
    const next = pump(finished.state)
    return {
      state: next.state,
      effects: [...finished.effects, ...next.effects],
    }
  }
  if (state.activity.kind === "playing") {
    const stopped = stopPlay(base)
    const next = pump(stopped.state)
    return {
      state: next.state,
      effects: [...stopped.effects, ...next.effects],
    }
  }
  return pump(base)
}

function report(
  state: StudioState,
  went: Went,
  text: string | null,
  at: string
): Step {
  if (state.screen.kind !== "done") return stay(state)
  const { screen } = state
  const effects: Array<StudioEffect> =
    screen.sitting === null
      ? []
      : [
          {
            type: "report",
            friction: {
              project: screen.project,
              sitting: screen.sitting,
              at,
              went,
              gotInTheWay: text,
            },
          },
        ]
  return {
    state: { ...state, screen: { ...screen, step: "saved", went } },
    effects,
  }
}

export function step(state: StudioState, event: StudioEvent): Step {
  const { activity, screen } = state
  const project = projectOf(state)

  switch (event.type) {
    case "entered": {
      if (state.page !== "new") return stay({ ...state, page: "here" })
      return {
        state: { ...state, page: "here" },
        effects: [{ type: "carry", at: event.at }],
      }
    }

    case "carried": {
      return read({
        ...state,
        notice:
          event.title === null
            ? state.notice
            : WORDS.notice.carried(event.title),
      })
    }

    case "carryFailed": {
      return read({ ...state, notice: WORDS.notice.carryFailed })
    }

    case "left": {
      const gone = { ...state, page: "left" as const }
      if (activity.kind === "recording") return finishRecording(gone)
      if (activity.kind === "playing") return stopPlay(gone)
      return stay(gone)
    }

    case "hidden": {
      return finishRecording({ ...state, visible: false })
    }

    case "shown": {
      return stay({ ...state, visible: true })
    }

    case "retryRead": {
      return read({ ...state, shelf: { kind: "reading" } })
    }

    case "listed": {
      if (event.seq !== state.readSeq) return stay(state)
      return pump(withProject(state, currentOf(event.projects)))
    }

    case "listFailed": {
      if (event.seq !== state.readSeq) return stay(state)
      return stay({ ...state, shelf: { kind: "unreadable" } })
    }

    case "primerPicked": {
      if (!isSettled(activity) || screen.kind !== "start") return stay(state)
      const seq = state.pickSeq + 1
      return {
        state: { ...state, pickSeq: seq, primerProblem: null, choosing: null },
        effects: [{ type: "readFile", file: event.file, seq }],
      }
    }

    case "primerUnreadable": {
      if (event.seq !== state.pickSeq) return stay(state)
      return stay({ ...state, primerProblem: WORDS.notice.unreadableFile })
    }

    case "primerRead": {
      if (event.seq !== state.pickSeq) return stay(state)
      const reading = readPrimer(event.text)
      if (!reading.ok) return stay({ ...state, primerProblem: reading.problem })
      if (project === null)
        return enqueue(state, {
          kind: "create",
          primer: reading.primer,
          at: event.at,
        })
      return stay({
        ...state,
        choosing: { primer: reading.primer, at: event.at },
      })
    }

    case "versionChosen": {
      const { choosing } = state
      if (choosing === null) return stay(state)
      const cleared = { ...state, choosing: null }
      if (event.as === "cancel") return stay(cleared)
      return enqueue(cleared, {
        kind: event.as === "next" ? "revise" : "create",
        primer: choosing.primer,
        at: choosing.at,
      })
    }

    case "recordChosen": {
      if (project === null || screen.kind !== "start") return stay(state)
      return enqueue(
        {
          ...state,
          screen: { kind: "record", shot: resumeAt(project) },
          notice: "",
          primerProblem: null,
          choosing: null,
        },
        { kind: "open", at: event.at }
      )
    }

    case "recordPressed": {
      if (activity.kind === "recording") return finishRecording(state)
      if (!isSettled(activity) || project === null || screen.kind !== "record")
        return stay(state)
      const capMs = capFor(project, screen.shot)
      if (capMs < SOUNDBITE_MIN_MS)
        return stay({ ...state, notice: WORDS.notice.spent })
      const opened = openTake()
      return {
        state: {
          ...state,
          activity: {
            kind: "opening",
            shot: screen.shot,
            capMs,
            project: project.id,
          },
          blocked: null,
          notice: "",
        },
        effects: [
          ...(activity.kind === "playing"
            ? [{ type: "stopPlayback" } as const]
            : []),
          ...opened.effects,
        ],
      }
    }

    case "discardPressed": {
      if (activity.kind !== "recording") return stay(state)
      const idle = pump({
        ...state,
        activity: { kind: "idle" },
        notice: WORDS.notice.thrownAway,
      })
      return {
        state: idle.state,
        effects: [...discardTake(activity).effects, ...idle.effects],
      }
    }

    case "ticked": {
      if (activity.kind !== "recording") return stay(state)
      const next = stepTake(activity, event, limitsOf(activity))
      return next.kind === "taking"
        ? taking(state, takeFor(activity), next.phase, next.effects)
        : stay(state)
    }

    case "micOpened": {
      if (activity.kind !== "opening") return stay(state)
      if (state.page === "left" || !state.visible || screen.kind !== "record") {
        const idle = pump({
          ...state,
          activity: { kind: "idle" },
          notice:
            state.page === "left" || screen.kind !== "record"
              ? state.notice
              : WORDS.notice.notStarted,
        })
        return {
          state: idle.state,
          effects: [{ type: "discardTake" }, ...idle.effects],
        }
      }
      const next = stepTake({ kind: "opening" }, event, limitsOf(activity))
      return next.kind === "taking"
        ? taking(state, takeFor(activity), next.phase, next.effects)
        : stay(state)
    }

    case "micFailed": {
      if (activity.kind !== "opening") return stay(state)
      const next = stepTake({ kind: "opening" }, event, limitsOf(activity))
      if (next.kind !== "blocked") return stay(state)
      return pump({
        ...state,
        activity: { kind: "idle" },
        blocked: next.reason,
      })
    }

    case "taken": {
      if (activity.kind !== "saving") return stay(state)
      const next = stepTake(FINISHING, event, limitsOf(activity))
      if (next.kind === "short")
        return pump({
          ...state,
          activity: { kind: "idle" },
          notice: WORDS.notice.tooShort,
        })
      if (next.kind !== "kept") return stay(state)
      return enqueue(state, {
        kind: "keep",
        project: activity.project,
        take: {
          shot: activity.shot,
          recordedAt: event.at,
          // The clock stops a take at its cap a tick late at worst.
          durationMs: Math.max(
            1,
            Math.round(Math.min(next.take.durationMs, activity.capMs))
          ),
          mimeType: next.take.mimeType,
        },
        audio: next.take.blob,
      })
    }

    case "takeFailed": {
      if (activity.kind !== "saving") return stay(state)
      return pump({
        ...state,
        activity: { kind: "idle" },
        notice: WORDS.notice.notKept,
      })
    }

    case "written": {
      const { inFlight } = state
      if (inFlight === null) return stay(state)
      const { pending } = inFlight
      const landed: StudioState = {
        ...withProject(state, inFlight.project),
        inFlight: null,
        notice: landedNotice(state, pending),
        activity: pending.kind === "keep" ? { kind: "idle" } : activity,
        closed: pending.kind === "close" ? "saved" : state.closed,
        screen:
          pending.kind === "create" || pending.kind === "revise"
            ? { kind: "start" }
            : placed(screen, inFlight.project),
      }
      return pump(landed)
    }

    case "writeFailed": {
      const { inFlight } = state
      if (inFlight === null) return stay(state)
      const { pending } = inFlight
      // Nothing of it was kept: read what the store holds, then go on.
      return read({
        ...state,
        inFlight: null,
        notice: refusedNotice(pending, event.reason),
        activity: pending.kind === "keep" ? { kind: "idle" } : activity,
        closed: pending.kind === "close" ? "failed" : state.closed,
      })
    }

    case "keepNextPressed": {
      if (project === null || screen.kind !== "record") return stay(state)
      const next = sceneBeside(project, screen.shot, 1)
      return next === null ? doneForNow(state, event.at) : moveTo(state, next)
    }

    case "previousPressed": {
      if (project === null || screen.kind !== "record") return stay(state)
      return moveTo(state, sceneBeside(project, screen.shot, -1))
    }

    case "doneForNowPressed": {
      return doneForNow(state, event.at)
    }

    case "wentChosen": {
      if (screen.kind !== "done" || screen.step !== "how") return stay(state)
      if (event.went !== "smooth")
        return stay({
          ...state,
          screen: { ...screen, step: "what", went: event.went },
        })
      return report(state, "smooth", null, event.at)
    }

    case "snagTold": {
      if (screen.kind !== "done" || screen.step !== "what") return stay(state)
      const text = event.text.trim()
      return report(
        state,
        screen.went ?? "snags",
        text === "" ? null : text,
        event.at
      )
    }

    case "reported": {
      return stay(state)
    }

    case "reportFailed": {
      return stay({ ...state, notice: WORDS.done.answerNotKept })
    }

    case "notYetPressed": {
      if (screen.kind !== "done") return stay(state)
      return stay({
        ...state,
        screen: { kind: "start" },
        notice: "",
        closed: null,
      })
    }

    case "takesArrived": {
      if (event.takes.length === 0) return stay(state)
      return enqueue(state, { kind: "arrived", takes: event.takes })
    }

    case "playPressed": {
      if (project === null || screen.kind !== "record") return stay(state)
      const id = project.chosen[screen.shot]
      if (activity.kind === "playing" && activity.take === id)
        return stopPlay(state)
      const take = project.takes.find((each) => each.id === id)
      if (!isSettled(activity) || take?.onPhone !== true) return stay(state)
      const seq = state.playSeq + 1
      return {
        state: {
          ...state,
          playSeq: seq,
          activity: { kind: "playing", take: take.id, seq },
        },
        effects: [
          ...(activity.kind === "playing"
            ? [{ type: "stopPlayback" } as const]
            : []),
          { type: "loadAudio", project: project.id, take: take.id, seq },
        ],
      }
    }

    case "audioLoaded": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return {
        state,
        effects: [
          { type: "startPlayback", audio: event.audio, seq: event.seq },
        ],
      }
    }

    case "audioMissing": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return stopPlay(state, WORDS.notice.audioMissing)
    }

    case "audioUnreadable": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return stopPlay(state, WORDS.notice.notPlayable)
    }

    case "playbackEnded": {
      if (!isCurrentPlay(state, event.seq)) return stay(state)
      return stopPlay(state)
    }

    default: {
      return assertNever(event)
    }
  }
}
