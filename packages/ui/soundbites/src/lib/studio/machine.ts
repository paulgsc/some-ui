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
 * - **A write is an operation, never a copy.** A change is a `Pending`
 *   operation naming its project, queued in order; its turn hands the store a
 *   pure `Change`, which the store applies to the project as it holds it, in
 *   the transaction that writes (`ProjectStore.update`). The screen's copy is
 *   only a view: it takes the store's answer to each write, and a change
 *   notice from another screen while one of ours is pending is kept (`stale`)
 *   and read once ours are done, never dropped.
 * - **Only a full phone refuses a take**, and the take's audio goes in the
 *   same write as the take, so nothing is half kept. The room left is read
 *   with the projects, and a take that couldn't fit is not started.
 * - **Writes don't wait on reads.** Once the Journal tab's episode is
 *   carried (or couldn't be), queued writes go on whether or not a read of
 *   the store succeeds, and on after the screen has gone; a read that fails
 *   once the screen shows the store leaves it showing, with a notice.
 * - **What wasn't kept is said, even to a screen that has gone.** A refusal
 *   after the screen left is kept in the store (`remember`), and a notice
 *   the store keeps is let go only once a read carrying it is shown
 *   (`forget`), so a failed or overtaken read loses none.
 * - **How a sitting went is filed against the sitting the store closed**, as
 *   its close returns it, never against the screen's copy. The answer waits
 *   in `filings`, not on the Done screen, so leaving that screen or the page
 *   loses none: it is filed when the close lands, or said lost if it fails.
 * - **Every video holding takes on the phone can be reached.** Start lists
 *   the others and opens any of them, so each one's takes can be shared and
 *   let go. An old Journal episode Studio can't move is no video: its notice
 *   says the room it takes, each time Studio opens.
 * - **One activity at a time.** Playing, opening the microphone, recording
 *   and keeping a take are arms of one union.
 * - **A scene runs its take and a breath.** Keeping a take writes, in the
 *   same write, a revision fitting its scene to it (`project/script.ts`).
 * - **Done for now keeps the take under way first.** The sitting closes
 *   after the take is kept or has failed, so its log counts it, and it
 *   records the scene on screen: the next sitting opens there. A microphone
 *   still opening is let go when it opens (`letGo`).
 * - **Nothing records while the page is off screen.** A take recording when
 *   the page is hidden or left is finished and kept; a microphone that opens
 *   then, or once the Record screen is gone, is let go.
 */
import { assertNever } from "@some-ui/core-utils"
import type { Look, Review, Voice } from "@some-ui/video-render"
import { readReview } from "@some-ui/video-render"
import type { RecordingFailure, Take, TakePhase } from "@some-ui/voice-capture"
import {
  discardTake,
  finishTake,
  openTake,
  stepTake,
} from "@some-ui/voice-capture"
import type { Listened } from "@soundbites/lib/idea/machine"
import type { Primer } from "@soundbites/lib/journal/primer"
import { readPrimer } from "@soundbites/lib/journal/primer"
import {
  SOUNDBITE_BITS_PER_SECOND,
  SOUNDBITE_MIN_MS,
} from "@soundbites/lib/policy"
import { isProjectFile, readProjectFile } from "@soundbites/lib/project/file"
import { finishOf, youtubeLink } from "@soundbites/lib/project/finish"
import type { Clash } from "@soundbites/lib/project/merge"
import { mergeIn } from "@soundbites/lib/project/merge"
import type { Note, Project, ProjectTake } from "@soundbites/lib/project/model"
import { latest, step as stepProject } from "@soundbites/lib/project/model"
import {
  capFor,
  currentOf,
  cutListOf,
  fitted,
  projectFromPrimer,
  projectIdFor,
  resumeAt,
  scriptOf,
} from "@soundbites/lib/project/script"
import type {
  Carried,
  Change,
  Friction,
  StoredNotice,
  Written,
} from "@soundbites/lib/project/store"

import type { TimeEvent } from "./time-log"
import { sceneBeside } from "./view"
import { askedAt, changesIn, isReviewOf, shotAt } from "./watch"
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
  | ({
      readonly kind: "opening"
      /** Done for now came first. */
      readonly letGo?: true
    } & TakeFor)
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
  /** Shape (ST6): a Look, then a Voice plan, one question each. */
  | {
      readonly kind: "shape"
      readonly step: "look" | "voice"
      readonly look: Look
      readonly voice: Voice
    }
  /** Finish (ST7): ready for YouTube, or the one thing missing. */
  | { readonly kind: "finish" }
  /** Start's quiet links (ST4): the video's versions, and time spent. */
  | { readonly kind: "history" }
  | {
      readonly kind: "time"
      /** The time log as read; null until it is. */
      readonly log: ReadonlyArray<TimeEvent> | null
    }
  /** Watch (ST5): a review render, with notes pinned to its moments. */
  | {
      readonly kind: "watch"
      /** The review render picked; null until one is. */
      readonly video: Blob | null
      /** The review.json picked with it, once read. */
      readonly review: Review | null
      /** Where the playhead is, in ms. */
      readonly atMs: number
      /** Claude's changes answered on this screen, by note id. */
      readonly answered: ReadonlyArray<string>
      /** Whether the phone can listen for a spoken note; asked on arrival. */
      readonly listen: "checking" | "available" | "unavailable"
      /** A note being said, until it is kept or let go. */
      readonly speaking: Speaking | null
    }
  | {
      readonly kind: "done"
      readonly step: "how" | "what" | "saved"
      readonly went: Went | null
      /** The video it asks about. */
      readonly project: string
      readonly shot: string
      /** When its close was asked for: the filing it answers (`filings`). */
      readonly at: string
    }

/** How a sitting went, as the person answered. */
type Answer = Pick<Friction, "at" | "went" | "gotInTheWay">

/** A Done for now's close, and the answer waiting on it to be filed. */
type Filing = {
  readonly project: string
  /** When the close was asked for: it names the close. */
  readonly at: string
  /** The sitting the store closed; null until it does, or if it didn't. */
  readonly sitting: string | null
  /** The scene on screen when Done for now was pressed. */
  readonly shot: string
  /** Whether the close has landed or been refused. */
  readonly settled: boolean
  readonly answer: Answer | null
}

type Shelf =
  | { readonly kind: "reading" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "read"; readonly projects: ReadonlyArray<Project> }

/**
 * A write waiting its turn, applied to its project (`project`, by id) as kept
 * when it starts.
 */
type Pending = { readonly project: string } & (
  | { readonly kind: "create"; readonly primer: Primer; readonly at: string }
  | { readonly kind: "revise"; readonly primer: Primer; readonly at: string }
  | { readonly kind: "open"; readonly at: string }
  | {
      readonly kind: "keep"
      readonly take: Pick<
        ProjectTake,
        "id" | "shot" | "recordedAt" | "durationMs" | "mimeType"
      >
      readonly audio: Blob
    }
  | { readonly kind: "close"; readonly at: string; readonly shot: string }
  | { readonly kind: "arrived"; readonly takes: ReadonlyArray<string> }
  | {
      readonly kind: "shape"
      readonly look: Look
      readonly voice: Voice
      readonly at: string
    }
  | { readonly kind: "ready"; readonly rev: number; readonly at: string }
  | {
      readonly kind: "note"
      readonly note: Omit<Note, "status" | "reason">
    }
  | { readonly kind: "good"; readonly note: string }
  /** A project file back from Claude (ST8), merged into the copy kept. */
  | { readonly kind: "merge"; readonly file: Project }
  | {
      readonly kind: "release"
      readonly rev: number
      readonly url: string
      readonly at: string
    }
)

/**
 * A note being said in Watch (ST5): pinned to the moment the playhead was
 * at when it was begun, since the render plays on while it is said, and
 * numbered so a late answer from an earlier one is ignored.
 */
export type Speaking = {
  readonly seq: number
  readonly atMs: number
  /** Listening (getting ready until `ready`), finishing after Done talking, then heard (LS1). */
  readonly phase: "listening" | "finishing" | "heard"
  readonly ready: boolean
  /** The words so far while listening; what was heard after. */
  readonly words: string
}

/** Whether a note is still being heard: begun, or finishing. */
function stillHearing(speaking: Speaking | null): boolean {
  return speaking?.phase === "listening" || speaking?.phase === "finishing"
}

export type StudioState = {
  readonly page: "new" | "here" | "left"
  readonly visible: boolean
  readonly shelf: Shelf
  /** The video on screen, by id; the one worked on last until one is opened. */
  readonly current: string | null
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
  readonly inFlight: Pending | null
  /** Another screen wrote while one of ours was pending: read once ours land. */
  readonly stale: boolean
  /** Whether the Journal tab's episode is carried (or couldn't be): writes wait on it. */
  readonly ready: boolean
  /** Notices from the store already shown, by key, so none is said twice. */
  readonly said: ReadonlyArray<number>
  /** The bytes of audio the phone may still keep, as last read; null unread. */
  readonly roomBytes: number | null
  /**
   * A Done for now's close waiting on the take under way, and every write asked
   * for after it, in order, so none runs ahead of that close.
   */
  readonly held: ReadonlyArray<Pending>
  /** Whether the Done screen's sitting is saved yet. */
  readonly closed: "saving" | "saved" | "failed" | null
  /** Each Done for now's close not yet settled, or whose answer waits. */
  readonly filings: ReadonlyArray<Filing>
  readonly readSeq: number
  readonly pickSeq: number
  readonly playSeq: number
  readonly listenSeq: number
}

/** What the person does. The runtime stamps each with when (`at`). */
export type StudioIntent =
  | { readonly type: "primerPicked"; readonly file: Blob }
  | {
      readonly type: "versionChosen"
      readonly as: "next" | "new" | "cancel"
    }
  | { readonly type: "recordChosen" }
  | { readonly type: "shapeChosen" }
  | { readonly type: "lookPicked"; readonly look: Look }
  | { readonly type: "voicePicked"; readonly voice: Voice }
  | { readonly type: "shapeNext" }
  | { readonly type: "shapeBack" }
  | { readonly type: "shapeKept" }
  | { readonly type: "finishChosen" }
  | { readonly type: "finishBack" }
  /** Finish's button to the one thing missing: the note's or take's scene. */
  | { readonly type: "finishGo" }
  | { readonly type: "readyMarked" }
  | { readonly type: "linkPasted"; readonly text: string }
  | { readonly type: "watchChosen" }
  | { readonly type: "historyChosen" }
  | { readonly type: "timeChosen" }
  /** Back to Start from a quiet link's screen. */
  | { readonly type: "quietBack" }
  | { readonly type: "watchBack" }
  /** The review render and its review.json, picked together. */
  | { readonly type: "reviewPicked"; readonly files: ReadonlyArray<Blob> }
  | { readonly type: "playheadAt"; readonly ms: number }
  | { readonly type: "notedHere"; readonly text: string }
  /** Say a note at the moment on screen, instead of typing it. */
  | { readonly type: "speakPressed" }
  | { readonly type: "speakStopped" }
  /** Keep the words heard as a note at the moment it was begun. */
  | { readonly type: "spokenKept" }
  | { readonly type: "spokenAgain" }
  | { readonly type: "spokenDropped" }
  | { readonly type: "changeGood"; readonly note: string }
  | { readonly type: "changeNotYet"; readonly note: string }
  | { readonly type: "recordPressed" }
  | { readonly type: "discardPressed" }
  | { readonly type: "keepNextPressed" }
  | { readonly type: "previousPressed" }
  | { readonly type: "playPressed" }
  | { readonly type: "doneForNowPressed" }
  | { readonly type: "wentChosen"; readonly went: Went }
  | { readonly type: "snagTold"; readonly text: string }
  | { readonly type: "notYetPressed" }
  | {
      readonly type: "takesArrived"
      readonly project: string
      readonly takes: ReadonlyArray<string>
    }
  | { readonly type: "projectOpened"; readonly project: string }
  | { readonly type: "retryRead" }

/** What the page, the clock and the ports report. */
type StudioSignal =
  | { readonly type: "entered"; readonly at: string }
  | { readonly type: "left" }
  | { readonly type: "hidden" }
  | { readonly type: "shown" }
  | { readonly type: "carried"; readonly carried: Carried }
  | { readonly type: "carryFailed" }
  | { readonly type: "storeChanged" }
  | { readonly type: "ticked"; readonly now: number; readonly level: number }
  | { readonly type: "micOpened"; readonly at: number }
  | { readonly type: "micFailed"; readonly reason: RecordingFailure }
  | {
      readonly type: "taken"
      readonly take: Take
      readonly at: string
      /** The take's id, the runtime's: unique across runtimes. */
      readonly id: string
    }
  | { readonly type: "takeFailed" }
  | {
      readonly type: "listed"
      readonly seq: number
      readonly projects: ReadonlyArray<Project>
      /** What screens that had gone away couldn't keep. */
      readonly notices: ReadonlyArray<StoredNotice>
      readonly roomBytes: number
    }
  | { readonly type: "listFailed"; readonly seq: number }
  | {
      readonly type: "primerRead"
      readonly seq: number
      readonly text: string
      readonly at: string
    }
  | { readonly type: "primerUnreadable"; readonly seq: number }
  | {
      readonly type: "reviewRead"
      readonly seq: number
      readonly text: string
    }
  | { readonly type: "reviewUnreadable"; readonly seq: number }
  | { readonly type: "timeLogRead"; readonly log: ReadonlyArray<TimeEvent> }
  | { readonly type: "written"; readonly written: Written }
  | { readonly type: "writeFailed"; readonly reason: "full" | "failed" }
  | { readonly type: "reported" }
  | { readonly type: "reportFailed" }
  | { readonly type: "audioLoaded"; readonly seq: number; readonly audio: Blob }
  | { readonly type: "audioMissing"; readonly seq: number }
  | { readonly type: "audioUnreadable"; readonly seq: number }
  | { readonly type: "playbackEnded"; readonly seq: number }
  | { readonly type: "voiceChecked"; readonly available: boolean }
  | { readonly type: "noteReady"; readonly seq: number }
  | { readonly type: "noteWords"; readonly seq: number; readonly words: string }
  | {
      readonly type: "noteListened"
      readonly seq: number
      readonly result: Listened
    }

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
  | { readonly type: "readTimeLog" }
  | {
      readonly type: "readFile"
      readonly file: Blob
      readonly seq: number
      /** What the text is read as: a primer (or project file), or a review. */
      readonly as: "primer" | "review"
    }
  | {
      readonly type: "write"
      readonly project: string
      readonly change: Change
      /** The take the change adds, with its audio, kept in the same write. */
      readonly audio?: { readonly take: string; readonly blob: Blob }
    }
  | { readonly type: "remember"; readonly notice: string }
  /** Let go of notices the store kept, now that a screen has shown them. */
  | { readonly type: "forget"; readonly keys: ReadonlyArray<number> }
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
  /** Ask whether the phone's recognizer can listen (ST5's spoken notes). */
  | { readonly type: "checkVoice" }
  | { readonly type: "listen"; readonly seq: number }
  | { readonly type: "stopListening" }
  | { readonly type: "cancelListening" }

export type Step = {
  readonly state: StudioState
  readonly effects: ReadonlyArray<StudioEffect>
}

export function initialStudioState(): StudioState {
  return {
    page: "new",
    visible: true,
    shelf: { kind: "reading" },
    current: null,
    screen: { kind: "start" },
    activity: { kind: "idle" },
    blocked: null,
    notice: "",
    primerProblem: null,
    choosing: null,
    queue: [],
    inFlight: null,
    stale: false,
    ready: false,
    said: [],
    roomBytes: null,
    held: [],
    closed: null,
    filings: [],
    readSeq: 0,
    pickSeq: 0,
    playSeq: 0,
    listenSeq: 0,
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

function projectsOf(state: StudioState): ReadonlyArray<Project> {
  return state.shelf.kind === "read" ? state.shelf.projects : []
}

/** The video on screen, as kept. */
export function projectOf(state: StudioState): Project | null {
  return projectsOf(state).find((each) => each.id === state.current) ?? null
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

/**
 * The project `pending` makes of `project` as the store holds it, or null
 * when it changes nothing. The store runs it in its write.
 */
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
      if (project !== null) return null
      return projectFromPrimer(pending.project, pending.primer, pending.at)
        .project
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
      if (project === null) return null
      const { take } = pending
      const withTake = model(project, { type: "taken", take }, take.shot)
      if (withTake === null) return null
      const { shots } = latest(withTake).cutList
      const n = shots.findIndex((shot) => shot.id === take.shot) + 1
      // A scene another screen's revision dropped keeps the take all the same.
      if (n === 0) return withTake
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
        // The person said they reached Drive (`STUDIO_WORDS.share`).
        const kept = model(at, { type: "keptBy", take, keeper: "drive" }) ?? at
        return model(kept, { type: "letGo", take }) ?? kept
      }, project)
      return after === project ? null : after
    }
    case "shape": {
      if (project === null) return null
      const { cutList } = latest(project)
      if (cutList.look === pending.look && cutList.voice === pending.voice)
        return null
      return model(project, {
        type: "revised",
        author: "owner",
        message: WORDS.shape.revised(pending.look, pending.voice),
        at: pending.at,
        cutList: { ...cutList, look: pending.look, voice: pending.voice },
      })
    }
    case "ready": {
      if (project === null) return null
      return model(project, {
        type: "markedReady",
        rev: pending.rev,
        at: pending.at,
      })
    }
    case "note": {
      if (project === null) return null
      return model(project, { type: "noted", note: pending.note })
    }
    case "good": {
      if (project === null) return null
      return model(project, {
        type: "noteSettled",
        id: pending.note,
        status: "confirmed",
      })
    }
    case "merge": {
      if (project === null) return null
      const merged = mergeIn(project, pending.file)
      return merged.kind === "merged" ? merged.project : null
    }
    case "release": {
      if (project === null) return null
      return model(project, {
        type: "released",
        rev: pending.rev,
        url: pending.url,
        at: pending.at,
      })
    }
    default: {
      return assertNever(pending)
    }
  }
}

type WatchScreen = Extract<StudioScreen, { kind: "watch" }>

/**
 * A spoken note in Watch (ST5), as ST18's questions are said: one listening
 * at a time, numbered, and the words heard shown back before they are kept.
 * A phone that can't listen, or stops being able to, takes typed notes.
 */
function speak(
  state: StudioState,
  screen: WatchScreen,
  event: Extract<
    StudioEvent,
    {
      type:
        | "voiceChecked"
        | "speakPressed"
        | "speakStopped"
        | "noteReady"
        | "noteWords"
        | "noteListened"
        | "spokenAgain"
        | "spokenDropped"
    }
  >
): Step {
  const { speaking } = screen
  const withScreen = (
    next: Partial<WatchScreen>,
    notice = state.notice
  ): StudioState => ({
    ...state,
    notice,
    screen: { ...screen, ...next },
  })
  const listen = (atMs: number): Step => {
    const seq = state.listenSeq + 1
    return {
      state: {
        ...withScreen(
          {
            speaking: {
              seq,
              atMs,
              phase: "listening",
              ready: false,
              words: "",
            },
          },
          ""
        ),
        listenSeq: seq,
      },
      effects: [{ type: "listen", seq }],
    }
  }
  switch (event.type) {
    case "voiceChecked": {
      return stay(
        withScreen({ listen: event.available ? "available" : "unavailable" })
      )
    }
    case "speakPressed": {
      if (
        screen.listen !== "available" ||
        speaking !== null ||
        screen.review === null ||
        shotAt(screen.review, screen.atMs) === null
      )
        return stay(state)
      return listen(screen.atMs)
    }
    case "speakStopped": {
      return speaking?.phase === "listening"
        ? {
            state: withScreen({
              speaking: { ...speaking, phase: "finishing" },
            }),
            effects: [{ type: "stopListening" }],
          }
        : stay(state)
    }
    case "noteReady": {
      return speaking?.seq === event.seq && speaking.phase === "listening"
        ? stay(withScreen({ speaking: { ...speaking, ready: true } }))
        : stay(state)
    }
    case "noteWords": {
      return speaking?.seq === event.seq && stillHearing(speaking)
        ? stay(withScreen({ speaking: { ...speaking, words: event.words } }))
        : stay(state)
    }
    case "noteListened": {
      if (speaking?.seq !== event.seq || !stillHearing(speaking))
        return stay(state)
      const { result } = event
      switch (result.kind) {
        case "heard": {
          // A recognizer that answers nothing after partial words: those
          // are the words, as the idea machine takes them.
          const words = result.words.trim() || speaking.words.trim()
          return words === ""
            ? stay(withScreen({ speaking: null }, WORDS.watch.heardNothing))
            : stay(
                withScreen({ speaking: { ...speaking, phase: "heard", words } })
              )
        }
        case "unavailable": {
          return stay(
            withScreen(
              { speaking: null, listen: "unavailable" },
              WORDS.watch.typeInstead
            )
          )
        }
        case "notStarted": {
          return stay(withScreen({ speaking: null }, WORDS.watch.notStarted))
        }
        case "failed": {
          return stay(withScreen({ speaking: null }, WORDS.watch.notHeard))
        }
        default: {
          return assertNever(result)
        }
      }
    }
    case "spokenAgain": {
      return speaking?.phase === "heard" ? listen(speaking.atMs) : stay(state)
    }
    case "spokenDropped": {
      if (speaking === null) return stay(state)
      return {
        state: withScreen({ speaking: null }),
        effects: stillHearing(speaking) ? [{ type: "cancelListening" }] : [],
      }
    }
    default: {
      return assertNever(event)
    }
  }
}

/** A note's id from when it was made: letters, digits and dashes. */
function noteIdAt(at: string): string {
  return `n-${at.replace(/[^0-9A-Za-z]/g, "")}`
}

/** Where a merge kept this phone's value (#2317), in the owner's terms. */
function keptHere(
  project: Project,
  clashes: ReadonlyArray<Clash>
): { readonly scenes: ReadonlyArray<number>; readonly plans: boolean } {
  const { shots } = latest(project).cutList
  // A scene is its place in the video, from 1.
  const scenes = clashes.flatMap((clash) => {
    const index = shots.findIndex((shot) => shot.id === clash.shot)
    return index < 0 ? [] : [index + 1]
  })
  return { scenes, plans: clashes.some((clash) => clash.shot === null) }
}

/** A project file picked: Claude's version of a video kept here, merged (ST8). */
function pickedProject(state: StudioState, text: string): Step {
  const read = readProjectFile(text)
  if (!read.ok) return stay({ ...state, primerProblem: WORDS.merge.unreadable })
  const file = read.value
  const kept = projectsOf(state).find((each) => each.id === file.id)
  if (kept === undefined)
    return stay({ ...state, primerProblem: WORDS.merge.notHere })
  const merged = mergeIn(kept, file)
  if (merged.kind === "kept")
    return stay({
      ...state,
      primerProblem: null,
      notice: WORDS.merge.kept(keptHere(kept, merged.clashes)),
    })
  if (merged.kind !== "merged")
    return stay({
      ...state,
      primerProblem: null,
      notice: WORDS.merge[merged.kind],
    })
  return enqueue(
    { ...state, current: kept.id, primerProblem: null, choosing: null },
    { kind: "merge", project: kept.id, file }
  )
}

/**
 * Starts the next write if none is in flight: the first pending one that
 * changes the project as kept. Held writes (a Done for now and all asked
 * for after it) join the queue once no take is under way.
 */
function pump(state: StudioState): Step {
  let at = state
  if (at.held.length > 0 && !isTaking(at.activity))
    at = { ...at, queue: [...at.queue, ...at.held], held: [] }
  if (at.inFlight !== null || !at.ready) return stay(at)
  const [pending, ...queue] = at.queue
  if (pending === undefined) {
    // Ours are all done: now read what another screen wrote meanwhile.
    return at.stale ? read({ ...at, stale: false }) : stay(at)
  }
  return {
    state: { ...at, queue, inFlight: pending },
    effects: [
      {
        type: "write",
        project: pending.project,
        change: (held) => applied(held, pending),
        ...(pending.kind === "keep"
          ? { audio: { take: pending.take.id, blob: pending.audio } }
          : {}),
      },
    ],
  }
}

/** Queues `pending`; behind any held close unless it keeps the take that close waits on. */
function enqueue(state: StudioState, pending: Pending): Step {
  if (state.held.length > 0 && pending.kind !== "keep")
    return pump({ ...state, held: [...state.held, pending] })
  return pump({ ...state, queue: [...state.queue, pending] })
}

/** How many of `takes` went from on the phone to off it in `written`. */
function letGoCount(written: Written, takes: ReadonlyArray<string>): number {
  const onPhone = (project: Project | null, id: string): boolean =>
    project?.takes.find((take) => take.id === id)?.onPhone === true
  return takes.filter(
    (id) => onPhone(written.before, id) && !onPhone(written.project, id)
  ).length
}

/** What a landed write says. */
function landedNotice(
  state: StudioState,
  pending: Pending,
  written: Written
): string {
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
      const n = letGoCount(written, pending.takes)
      return n === 0 ? state.notice : WORDS.notice.arrived(n)
    }
    case "open":
    case "close":
    case "shape": {
      return state.notice
    }
    case "ready": {
      return WORDS.finish.marked
    }
    case "release": {
      return WORDS.finish.released
    }
    case "merge": {
      const merged =
        written.before === null ? null : mergeIn(written.before, pending.file)
      const clashes = merged?.kind === "merged" ? merged.clashes : []
      return WORDS.merge.merged(
        latest(pending.file).message,
        written.project === null
          ? undefined
          : keptHere(written.project, clashes)
      )
    }
    case "note": {
      return WORDS.watch.noted
    }
    case "good": {
      return state.notice
    }
    default: {
      return assertNever(pending)
    }
  }
}

/**
 * What a refused write says it didn't keep. A close says it on the Done
 * screen itself (`closed`), so it covers no other notice.
 */
function refusedNotice(
  state: StudioState,
  pending: Pending,
  reason: "full" | "failed"
): string {
  if (pending.kind === "keep")
    return reason === "full" ? WORDS.notice.full : WORDS.notice.notKept
  if (pending.kind === "close") return state.notice
  return WORDS.notice.notSaved
}

/** What a write that changed nothing says, if anything. */
function unchangedNotice(state: StudioState, pending: Pending): string {
  switch (pending.kind) {
    case "keep": {
      return WORDS.notice.notKept
    }
    case "create":
    case "revise": {
      return WORDS.notice.notSaved
    }
    case "open":
    case "close":
    case "arrived": {
      return state.notice
    }
    case "shape":
    case "ready":
    case "release":
    case "note":
    case "good": {
      return WORDS.notice.notSaved
    }
    case "merge": {
      // It merged when picked: the phone made a version in between.
      return WORDS.merge.moved
    }
    default: {
      return assertNever(pending)
    }
  }
}

/**
 * `state` saying `notice`. With the screen gone, `lost` (what wasn't kept,
 * if anything) is kept by the store for the next Start to say.
 */
function told(state: StudioState, notice: string, lost: string | null): Step {
  return {
    state: { ...state, notice },
    effects:
      lost !== null && state.page === "left"
        ? [{ type: "remember", notice: lost }]
        : [],
  }
}

/** What a write that kept nothing of `pending` lost, for a gone screen. */
function lostBy(pending: Pending, notice: string): string {
  return pending.kind === "close" ? WORDS.done.notSaved : notice
}

/**
 * Files each waiting answer once the sitting the store closed for it is
 * known, whatever screen is up; for a close that closed none, says the
 * answer wasn't kept (and keeps saying so for the next Start, with the screen
 * gone). Lets go of a settled filing no answer waits on once its Done screen
 * is gone.
 */
function fileAnswers(state: StudioState): Step {
  const effects: Array<StudioEffect> = state.filings.flatMap((filing) =>
    filing.answer !== null && filing.sitting !== null
      ? [
          {
            type: "report" as const,
            friction: {
              project: filing.project,
              sitting: filing.sitting,
              shot: filing.shot,
              ...filing.answer,
            },
          },
        ]
      : []
  )
  const lost = state.filings.some(
    (filing) =>
      filing.answer !== null && filing.sitting === null && filing.settled
  )
  const left = state.filings.filter((filing) => {
    if (filing.answer !== null)
      return filing.sitting === null && !filing.settled
    const asked = state.screen.kind === "done" && state.screen.at === filing.at
    return !filing.settled || asked
  })
  const filed = { ...state, filings: left }
  if (!lost) return { state: filed, effects }
  const said = told(filed, WORDS.done.answerNotKept, WORDS.done.answerNotKept)
  return { state: said.state, effects: [...effects, ...said.effects] }
}

/**
 * A close landed, closing `sitting`, or closed none (null): its filing learns
 * which, the Done screen asking about it says so, and with that screen gone
 * a close that closed none is said wherever the person is.
 */
function closeSettled(
  state: StudioState,
  pending: Pending,
  sitting: string | null
): Step {
  if (pending.kind !== "close") return stay(state)
  const asked = state.screen.kind === "done" && state.screen.at === pending.at
  const next: StudioState = {
    ...state,
    filings: state.filings.map((filing) =>
      filing.project === pending.project && filing.at === pending.at
        ? { ...filing, sitting, settled: true }
        : filing
    ),
    closed: asked ? (sitting === null ? "failed" : "saved") : state.closed,
    notice: sitting === null && !asked ? WORDS.done.notSaved : state.notice,
  }
  return fileAnswers(next)
}

/** The sitting a landed close closed, as the store returned it. */
function closedSitting(pending: Pending, written: Written): string | null {
  if (pending.kind !== "close" || !written.changed) return null
  return (
    written.project?.sittings.find(
      (each) => each.closedAt === pending.at && each.shot === pending.shot
    )?.id ?? null
  )
}

/** `first`, then `then` from its state, effects in order. */
function then(first: Step, next: (state: StudioState) => Step): Step {
  const second = next(first.state)
  return {
    state: second.state,
    effects: [...first.effects, ...second.effects],
  }
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

/** `state` holding `projects`, on `current` if it is among them. */
function withProjects(
  state: StudioState,
  projects: ReadonlyArray<Project>,
  current: string | null
): StudioState {
  const shown = projects.find((each) => each.id === current) ?? null
  return {
    ...state,
    shelf: { kind: "read", projects },
    current: shown?.id ?? null,
    screen: placed(state.screen, shown),
  }
}

/** `projects` with `project` in place of its kept copy, or added. */
function replaced(
  projects: ReadonlyArray<Project>,
  project: Project
): ReadonlyArray<Project> {
  return projects.some((each) => each.id === project.id)
    ? projects.map((each) => (each.id === project.id ? project : each))
    : [...projects, project]
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
  const screen: StudioScreen = {
    kind: "done",
    step: "how",
    went: null,
    project: project.id,
    shot: state.screen.shot,
    at,
  }
  const base: StudioState = {
    ...state,
    screen,
    closed: "saving",
    filings: [
      ...state.filings,
      {
        project: project.id,
        at,
        sitting: null,
        shot: state.screen.shot,
        settled: false,
        answer: null,
      },
    ],
    held: [
      ...state.held,
      { kind: "close", project: project.id, at, shot: state.screen.shot },
    ],
  }
  if (state.activity.kind === "recording") {
    const finished = finishRecording(base)
    const next = pump(finished.state)
    return {
      state: next.state,
      effects: [...finished.effects, ...next.effects],
    }
  }
  if (state.activity.kind === "opening") {
    return pump({ ...base, activity: { ...state.activity, letGo: true } })
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
  const { screen } = state
  if (screen.kind !== "done") return stay(state)
  return fileAnswers({
    ...state,
    screen: { ...screen, step: "saved", went },
    filings: state.filings.map((filing) =>
      filing.at === screen.at && filing.project === screen.project
        ? { ...filing, answer: { at, went, gotInTheWay: text } }
        : filing
    ),
  })
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
      const { carried } = event
      return read({
        ...state,
        ready: true,
        notice:
          carried.kind === "carried"
            ? WORDS.notice.carried(
                latest(carried.project).cutList.title,
                carried.cleared,
                carried.gone
              )
            : carried.kind === "stays"
              ? WORDS.notice.carryStays(carried.bytes)
              : carried.kind === "unread"
                ? WORDS.notice.carryUnread
                : carried.cleared > 0
                  ? WORDS.notice.cleared(carried.cleared)
                  : state.notice,
      })
    }

    case "storeChanged": {
      // Ours re-read as they land; this is a write from elsewhere.
      if (state.page !== "here" || state.shelf.kind !== "read")
        return stay(state)
      // Ours first: the notice waits for them, and is never dropped.
      if (
        state.inFlight !== null ||
        state.queue.length > 0 ||
        state.held.length > 0
      )
        return stay({ ...state, stale: true })
      return read(state)
    }

    case "carryFailed": {
      // Writes go on: the episode stays in the Journal tab's stores.
      return read({
        ...state,
        ready: true,
        notice: WORDS.notice.carryFailed,
      })
    }

    case "left": {
      const gone = { ...state, page: "left" as const }
      if (activity.kind === "recording") return finishRecording(gone)
      if (activity.kind === "playing") return stopPlay(gone)
      // A note being said has no screen left to show it back on.
      if (screen.kind === "watch" && screen.speaking !== null)
        return {
          state: { ...gone, screen: { ...screen, speaking: null } },
          effects: stillHearing(screen.speaking)
            ? [{ type: "cancelListening" }]
            : [],
        }
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
      const kept = event.projects.some((each) => each.id === state.current)
      // Only a screen on view shows the store's notices, and so lets them go.
      const onView = state.page === "here"
      const fresh = onView
        ? event.notices.filter((each) => !state.said.includes(each.key))
        : []
      const keys = onView ? event.notices.map((each) => each.key) : []
      const shown = withProjects(
        {
          ...state,
          roomBytes: event.roomBytes,
          said: [...state.said, ...fresh.map((each) => each.key)],
          notice:
            fresh.length === 0
              ? state.notice
              : [...fresh.map((each) => each.text), state.notice]
                  .filter(Boolean)
                  .join(" "),
        },
        event.projects,
        kept ? state.current : (currentOf(event.projects)?.id ?? null)
      )
      // Shown, so the store may let them go.
      return then(
        {
          state: shown,
          effects: keys.length === 0 ? [] : [{ type: "forget", keys }],
        },
        pump
      )
    }

    case "listFailed": {
      if (event.seq !== state.readSeq) return stay(state)
      // Once the store is on screen, a failed read leaves it there: Record
      // and its Stop stay, and the writes queued go on regardless.
      if (state.shelf.kind === "read")
        return stay({ ...state, notice: WORDS.notice.behind })
      return stay({ ...state, shelf: { kind: "unreadable" } })
    }

    case "primerPicked": {
      if (!isSettled(activity) || screen.kind !== "start") return stay(state)
      const seq = state.pickSeq + 1
      return {
        state: { ...state, pickSeq: seq, primerProblem: null, choosing: null },
        effects: [{ type: "readFile", file: event.file, seq, as: "primer" }],
      }
    }

    case "primerUnreadable": {
      if (event.seq !== state.pickSeq) return stay(state)
      return stay({ ...state, primerProblem: WORDS.notice.unreadableFile })
    }

    case "primerRead": {
      if (event.seq !== state.pickSeq) return stay(state)
      if (isProjectFile(event.text)) return pickedProject(state, event.text)
      const reading = readPrimer(event.text)
      // What is wrong names cuts and fields: for the session that wrote the
      // file (`PrimerReading`), never the screen (SW1).
      if (!reading.ok)
        return stay({ ...state, primerProblem: WORDS.start.sentProblem })
      if (project === null)
        return enqueue(state, {
          kind: "create",
          project: projectIdFor(reading.primer.title, event.at),
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
      if (event.as === "cancel" || (event.as === "next" && project === null))
        return stay(cleared)
      if (event.as === "next" && project !== null)
        return enqueue(cleared, {
          kind: "revise",
          project: project.id,
          primer: choosing.primer,
          at: choosing.at,
        })
      return enqueue(cleared, {
        kind: "create",
        project: projectIdFor(choosing.primer.title, choosing.at),
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
        { kind: "open", project: project.id, at: event.at }
      )
    }

    case "shapeChosen": {
      if (project === null || screen.kind !== "start" || !isSettled(activity))
        return stay(state)
      const { look, voice } = latest(project).cutList
      return enqueue(
        {
          ...state,
          screen: { kind: "shape", step: "look", look, voice },
          notice: "",
          choosing: null,
        },
        { kind: "open", project: project.id, at: event.at }
      )
    }

    case "lookPicked": {
      return screen.kind === "shape" && screen.step === "look"
        ? stay({ ...state, screen: { ...screen, look: event.look } })
        : stay(state)
    }

    case "voicePicked": {
      return screen.kind === "shape" && screen.step === "voice"
        ? stay({ ...state, screen: { ...screen, voice: event.voice } })
        : stay(state)
    }

    case "shapeNext": {
      return screen.kind === "shape" && screen.step === "look"
        ? stay({ ...state, screen: { ...screen, step: "voice" } })
        : stay(state)
    }

    case "shapeBack": {
      if (screen.kind !== "shape") return stay(state)
      return stay({
        ...state,
        screen:
          screen.step === "voice"
            ? { ...screen, step: "look" }
            : { kind: "start" },
      })
    }

    case "shapeKept": {
      if (
        screen.kind !== "shape" ||
        screen.step !== "voice" ||
        project === null
      )
        return stay(state)
      return enqueue(
        {
          ...state,
          screen: { kind: "start" },
          notice: WORDS.shape.kept(screen.look, screen.voice),
        },
        {
          kind: "shape",
          project: project.id,
          look: screen.look,
          voice: screen.voice,
          at: event.at,
        }
      )
    }

    case "historyChosen":
    case "timeChosen": {
      if (project === null || screen.kind !== "start" || !isSettled(activity))
        return stay(state)
      const chosen = {
        ...state,
        notice: "",
        choosing: null,
        screen:
          event.type === "historyChosen"
            ? ({ kind: "history" } as const)
            : ({ kind: "time", log: null } as const),
      }
      return event.type === "historyChosen"
        ? stay(chosen)
        : { state: chosen, effects: [{ type: "readTimeLog" }] }
    }

    case "timeLogRead": {
      return screen.kind === "time"
        ? stay({ ...state, screen: { kind: "time", log: event.log } })
        : stay(state)
    }

    case "quietBack": {
      return screen.kind === "history" || screen.kind === "time"
        ? stay({ ...state, screen: { kind: "start" } })
        : stay(state)
    }

    case "watchChosen": {
      if (project === null || screen.kind !== "start" || !isSettled(activity))
        return stay(state)
      const opened = enqueue(
        {
          ...state,
          screen: {
            kind: "watch",
            video: null,
            review: null,
            atMs: 0,
            answered: [],
            listen: "checking",
            speaking: null,
          },
          notice: "",
          choosing: null,
        },
        { kind: "open", project: project.id, at: event.at }
      )
      return { ...opened, effects: [...opened.effects, { type: "checkVoice" }] }
    }

    case "watchBack": {
      if (screen.kind !== "watch") return stay(state)
      return {
        state: { ...state, screen: { kind: "start" }, notice: "" },
        effects: stillHearing(screen.speaking)
          ? [{ type: "cancelListening" }]
          : [],
      }
    }

    case "voiceChecked":
    case "speakPressed":
    case "speakStopped":
    case "noteReady":
    case "noteWords":
    case "noteListened":
    case "spokenAgain":
    case "spokenDropped": {
      return screen.kind === "watch" ? speak(state, screen, event) : stay(state)
    }

    case "spokenKept": {
      const speaking = screen.kind === "watch" ? screen.speaking : null
      if (
        screen.kind !== "watch" ||
        speaking?.phase !== "heard" ||
        screen.review === null ||
        project === null
      )
        return stay(state)
      const here = shotAt(screen.review, speaking.atMs)
      const cleared = { ...state, screen: { ...screen, speaking: null } }
      if (here === null) return stay(cleared)
      return enqueue(
        { ...cleared, notice: "" },
        {
          kind: "note",
          project: project.id,
          note: {
            id: noteIdAt(event.at),
            rev: screen.review.rev,
            shot: here.shot,
            offsetMs: here.offsetMs,
            author: "owner",
            text: speaking.words,
          },
        }
      )
    }

    case "reviewPicked": {
      if (screen.kind !== "watch") return stay(state)
      const video = event.files.find((file) => file.type.startsWith("video/"))
      const review = event.files.find((file) => file !== video)
      if (video === undefined || review === undefined)
        return stay({ ...state, notice: WORDS.watch.pickBoth })
      const seq = state.pickSeq + 1
      return {
        state: {
          ...state,
          pickSeq: seq,
          notice: "",
          screen: { ...screen, video, review: null, atMs: 0, answered: [] },
        },
        effects: [{ type: "readFile", file: review, seq, as: "review" }],
      }
    }

    case "reviewRead": {
      if (event.seq !== state.pickSeq || screen.kind !== "watch")
        return stay(state)
      const read = readReview(event.text)
      if (!read.ok)
        return stay({
          ...state,
          notice: WORDS.watch.unreadable,
          screen: { ...screen, video: null },
        })
      if (project === null || !isReviewOf(project, read.value))
        return stay({
          ...state,
          notice: WORDS.watch.notThisVideo,
          screen: { ...screen, video: null },
        })
      return stay({ ...state, screen: { ...screen, review: read.value } })
    }

    case "reviewUnreadable": {
      if (event.seq !== state.pickSeq || screen.kind !== "watch")
        return stay(state)
      return stay({
        ...state,
        notice: WORDS.watch.unreadable,
        screen: { ...screen, video: null },
      })
    }

    case "playheadAt": {
      return screen.kind === "watch" && screen.atMs !== event.ms
        ? stay({ ...state, screen: { ...screen, atMs: event.ms } })
        : stay(state)
    }

    case "notedHere": {
      if (screen.kind !== "watch" || screen.review === null || project === null)
        return stay(state)
      const text = event.text.trim()
      const here = shotAt(screen.review, screen.atMs)
      if (text === "" || here === null) return stay(state)
      return enqueue(
        { ...state, notice: "" },
        {
          kind: "note",
          project: project.id,
          note: {
            id: noteIdAt(event.at),
            rev: screen.review.rev,
            shot: here.shot,
            offsetMs: here.offsetMs,
            author: "owner",
            text,
          },
        }
      )
    }

    case "changeGood":
    case "changeNotYet": {
      if (screen.kind !== "watch" || screen.review === null || project === null)
        return stay(state)
      const asked = askedAt(
        changesIn(project, screen.review),
        screen.atMs,
        screen.answered
      )
      if (asked?.note.id !== event.note) return stay(state)
      const answered = {
        ...state,
        screen: { ...screen, answered: [...screen.answered, asked.note.id] },
      }
      if (event.type === "changeGood")
        return enqueue(answered, {
          kind: "good",
          project: project.id,
          note: asked.note.id,
        })
      return enqueue(answered, {
        kind: "note",
        project: project.id,
        note: {
          id: noteIdAt(event.at),
          rev: screen.review.rev,
          shot: asked.shot,
          offsetMs: asked.offsetMs,
          author: "owner",
          text: WORDS.watch.notYetText(asked.note.text),
        },
      })
    }

    case "finishChosen": {
      if (project === null || screen.kind !== "start" || !isSettled(activity))
        return stay(state)
      return enqueue(
        { ...state, screen: { kind: "finish" }, notice: "", choosing: null },
        { kind: "open", project: project.id, at: event.at }
      )
    }

    case "finishBack": {
      return screen.kind === "finish"
        ? stay({ ...state, screen: { kind: "start" } })
        : stay(state)
    }

    case "finishGo": {
      if (screen.kind !== "finish" || project === null) return stay(state)
      const finish = finishOf(project)
      if (finish.kind !== "note" && finish.kind !== "take") return stay(state)
      const wanted = finish.kind === "take" ? finish.shot : finish.note.shot
      // A note on a scene a later revision dropped opens where work resumes.
      const there = latest(project).cutList.shots.some(
        (each) => each.id === wanted
      )
      return enqueue(
        {
          ...state,
          screen: {
            kind: "record",
            shot: there ? wanted : resumeAt(project),
          },
          notice: "",
        },
        { kind: "open", project: project.id, at: event.at }
      )
    }

    case "readyMarked": {
      if (screen.kind !== "finish" || project === null) return stay(state)
      const finish = finishOf(project)
      if (finish.kind !== "unmarked") return stay(state)
      return enqueue(
        { ...state, notice: "" },
        { kind: "ready", project: project.id, rev: finish.rev, at: event.at }
      )
    }

    case "linkPasted": {
      if (screen.kind !== "finish" || project === null) return stay(state)
      const finish = finishOf(project)
      if (finish.kind !== "ready") return stay(state)
      const url = youtubeLink(event.text)
      if (url === null) return stay({ ...state, notice: WORDS.finish.notALink })
      return enqueue(
        { ...state, notice: "" },
        {
          kind: "release",
          project: project.id,
          rev: finish.rev,
          url,
          at: event.at,
        }
      )
    }

    case "recordPressed": {
      if (activity.kind === "recording") return finishRecording(state)
      if (!isSettled(activity) || project === null || screen.kind !== "record")
        return stay(state)
      const roomMs =
        state.roomBytes === null
          ? Number.POSITIVE_INFINITY
          : Math.floor((state.roomBytes * 8_000) / SOUNDBITE_BITS_PER_SECOND)
      const capMs = Math.min(capFor(project, screen.shot), roomMs)
      if (capMs < SOUNDBITE_MIN_MS)
        return stay({
          ...state,
          notice:
            roomMs < SOUNDBITE_MIN_MS
              ? WORDS.notice.noRoom
              : WORDS.notice.spent,
        })
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
      const quietly =
        activity.letGo === true ||
        state.page === "left" ||
        screen.kind !== "record"
      if (quietly || !state.visible) {
        const idle = pump({
          ...state,
          activity: { kind: "idle" },
          notice: quietly ? state.notice : WORDS.notice.notStarted,
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
          id: event.id,
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
      const pending = state.inFlight
      if (pending === null) return stay(state)
      const { written } = event
      const projects =
        written.project === null
          ? projectsOf(state)
          : replaced(projectsOf(state), written.project)
      const opened =
        pending.kind === "create" && written.changed
          ? pending.project
          : state.current
      const landed = withProjects(
        {
          ...state,
          inFlight: null,
          activity: pending.kind === "keep" ? { kind: "idle" } : activity,
          screen:
            (pending.kind === "create" || pending.kind === "revise") &&
            written.changed
              ? { kind: "start" }
              : screen,
        },
        projects,
        opened
      )
      const notice = written.changed
        ? landedNotice(state, pending, written)
        : unchangedNotice(state, pending)
      return then(
        then(
          told(
            landed,
            notice,
            written.changed ? null : lostBy(pending, notice)
          ),
          (now) => closeSettled(now, pending, closedSitting(pending, written))
        ),
        pump
      )
    }

    case "writeFailed": {
      const pending = state.inFlight
      if (pending === null) return stay(state)
      // Nothing of it was kept; the store is as it was, and the queue goes on.
      const notice = refusedNotice(state, pending, event.reason)
      return then(
        then(
          told(
            {
              ...state,
              inFlight: null,
              activity: pending.kind === "keep" ? { kind: "idle" } : activity,
            },
            notice,
            lostBy(pending, notice)
          ),
          (now) => closeSettled(now, pending, null)
        ),
        pump
      )
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
      return told(state, WORDS.done.answerNotKept, WORDS.done.answerNotKept)
    }

    case "notYetPressed": {
      if (screen.kind !== "done") return stay(state)
      // A waiting answer stays in `filings`, filed when its close lands.
      return fileAnswers({
        ...state,
        screen: { kind: "start" },
        notice: "",
        closed: null,
      })
    }

    case "takesArrived": {
      if (event.takes.length === 0) return stay(state)
      return enqueue(state, {
        kind: "arrived",
        project: event.project,
        takes: event.takes,
      })
    }

    case "projectOpened": {
      if (
        screen.kind !== "start" ||
        !isSettled(activity) ||
        !projectsOf(state).some((each) => each.id === event.project)
      )
        return stay(state)
      return stay({
        ...state,
        current: event.project,
        notice: "",
        choosing: null,
        primerProblem: null,
      })
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
