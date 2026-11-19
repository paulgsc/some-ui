/**
 * Runs a week on the phone (RR13): the shared bundle runtime
 * (`@some-ui/voice-capture`'s `bundleRuntime`) over the week's spec
 * (`./spec`), its draft and the weeks sent (`./store`), and the words home
 * heard in each take sent (`heard`), which it decides nothing about.
 *
 * Words are asked for once per take each time the week opens already sent,
 * never on a clock and never in the opening Send happened in, when the note
 * has not gone yet: a take home hasn't heard is asked again the next time
 * the week opens. Words that come back are kept on the phone (`./store`'s
 * `heardWords`), so they show offline after, and shown even when the phone
 * can't keep them; any other answer is only shown, as that opening's. An
 * answer that comes after the screen went is still kept: it can only add
 * words home heard, never change any.
 */
import type { DecisionsSent } from "@rust-rounds/lib/decisions"
import { atSend } from "@rust-rounds/lib/decisions"
import type { HeldWeek } from "@rust-rounds/lib/weeks"
import type { WorkPorts } from "@rust-rounds/lib/work-tracker/runtime"
import type { KeyedStorage } from "@some-ui/core-utils"
import { weekOpenNow } from "@some-ui/core-utils"
import type { EngagementEvent } from "@some-ui/engagement"
import type { Prompter } from "@some-ui/shared"
import {
  DEFAULT_PACE_WPM,
  NO_PROMPTER,
  paceOf,
  stepPace,
  stepPrompter,
  totalOf,
} from "@some-ui/shared"
import type {
  BundleHome,
  BundleMachine,
  BundleRuntime,
  BundleTakes,
  HeardAnswer,
  Player,
} from "@some-ui/voice-capture"
import { bundleRuntime, HEARD_FLOOR } from "@some-ui/voice-capture"

import type { FlowRuntime } from "./flow-runtime"
import { createFlow } from "./flow-runtime"
import type { HomeOpening, HomeWeekRecord, Playback } from "./opening"
import { NOT_PLAYING, OPENING_UNKNOWN, stepPlayback, takeMs } from "./opening"
import type { OnScreen, Open } from "./opens"
import { stepOpens } from "./opens"
import type { PasteRuntime } from "./paste"
import { pasteRuntime } from "./paste"
import {
  firstItemOf,
  itemOf,
  openingItem,
  openingOf,
  pointItem,
} from "./points"
import type {
  HomeWeekSent,
  OpeningSpec,
  WeekAtHome,
  WeekKind,
  WeekSent,
} from "./spec"
import {
  HOME_UNKNOWN,
  isClosed,
  ticketLine,
  weekAtHome,
  weekMachine,
} from "./spec"
import {
  heardWords,
  ofWeek,
  pasteStores,
  weekDrafts,
  weekPicks,
  weeksSent,
} from "./store"

export type RustWeekPorts = {
  /** The week to play: the one this phone holds that is open now. */
  readonly week: HeldWeek
  /** The phone's desk of the week's takes, with `send: "on-confirm"`. */
  readonly takes: BundleTakes
  /** Where the draft, the weeks sent and the words heard are kept. */
  readonly storage: KeyedStorage | null
  readonly home: BundleHome
  /** Home's words for a note, asked once; never rejects. */
  readonly heard: (take: string) => Promise<HeardAnswer>
  /**
   * Whether home holds this send of the week, as the link last heard (RR22):
   * read when the week opens, after each Send and whenever the link says it
   * heard more (`onHomeHolds`), never asked of home.
   */
  readonly homeHolds: (sent: WeekSent) => boolean
  /** Calls `listener` whenever what `homeHolds` answers may have changed. Returns the stop. */
  readonly onHomeHolds: (listener: () => void) => () => void
  /**
   * What home's own record says of week `week` (RR30, #3269): what was sent,
   * asked once each time a closed week opens, and the opening's takes home
   * plays, asked once each time a week with an opening opens; never
   * rejects. Without it, a closed week reads only what the link remembers,
   * and the opening's questions say their take isn't known yet.
   */
  readonly homeRecord?: (week: string) => Promise<HomeWeekRecord>
  /** Milliseconds since the epoch. */
  readonly now: () => number
  readonly newId: () => string
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
  /** Where each opening of a ticket is told (`./opens`): the app's engagement sink. */
  readonly engage: (event: EngagementEvent) => void
  /**
   * A take per speak-to point (RR24, `./points`), where this build's home
   * serves them (contract epoch 20 on); else a take per ticket. Fixed for
   * the week's opening.
   */
  readonly perPoint: boolean
  /** The work tracker and the week's time (RR26), where this build has them. */
  readonly work?: WorkPorts
  /**
   * The decision at each fork goes home with the week sent (RR29), where
   * this build's home keeps them (contract epoch 24 on). Fixed for the
   * week's opening.
   */
  readonly verdicts: boolean
  /**
   * The week's opening is read and recorded first in its flow (#3269), where
   * the week carries one and this build's home keeps its takes (contract
   * epoch 25 on); absent or false, the week opens on its tickets. Fixed for
   * the week's opening.
   */
  readonly opening?: boolean
  /** Note `take`'s audio from home (MD8's read), asked once; never rejects. */
  readonly homeAudio?: (take: string) => Promise<Blob | null>
  /** What plays a take from home. */
  readonly player?: Player
  /**
   * The teleprompter's pace, kept on this phone (C734): the same the
   * interview week's band reads, so the owner sets it once.
   */
  readonly pace?: {
    readonly read: () => number
    readonly write: (pace: number) => unknown
  }
}

/** The opening's pages' state (#3269): home's record, a take playing from home, the band. */
export type OpeningView = {
  readonly home: HomeOpening
  readonly playback: Playback
  /** The teleprompter band over the answer being read (`@some-ui/shared`). */
  readonly prompter: Prompter
  /** Words a minute the band moves at, as the owner set it. */
  readonly pace: number
}

/** The week's opening, where it is read and recorded (`RustWeekPorts`' `opening`). */
export type OpeningRuntime = {
  /** Its version and how many questions it asks. */
  readonly spec: OpeningSpec
  readonly getSnapshot: () => OpeningView
  readonly subscribe: (listener: () => void) => () => void
  /** Plays take `take` from home, or stops it when it is playing. */
  readonly play: (take: string) => void
  /** Stops what plays, and lets go of what home couldn't give. */
  readonly stop: () => void
  /** The band's Pause / Go on. */
  readonly pause: () => void
  /** The band's Slower / Faster, kept on this phone. */
  readonly setPace: (to: "slower" | "faster") => void
}

export type RustWeek = {
  readonly machine: BundleMachine<WeekKind>
  readonly bundle: BundleRuntime<WeekKind>
  /** What home said of each take sent, by take, the same object while unchanged. */
  readonly heard: {
    readonly getSnapshot: () => WeekHeard
    readonly subscribe: (listener: () => void) => () => void
  }
  /**
   * What home holds of the week and what this phone last sent (`./spec`'s
   * `weekAtHome`), the same object while unchanged.
   */
  readonly atHome: {
    readonly getSnapshot: () => WeekAtHome
    readonly subscribe: (listener: () => void) => () => void
  }
  /** An error pasted from the owner's own code, with a note (`./paste`). */
  readonly paste: PasteRuntime
  /**
   * The week's flow (RR25, `./flow-runtime`): read, academy and voice per
   * ticket on one line. Null where takes go by ticket (`perPoint` off), which
   * keeps the card per ticket.
   */
  readonly flow: FlowRuntime | null
  /** The week's opening (#3269), where it is read and recorded; else null. */
  readonly opening: OpeningRuntime | null
  /** The screen is showing. Returns the detach. */
  readonly attach: () => () => void
}

/** Each take's words, or what home last said of them this opening. */
export type WeekHeard = Readonly<Partial<Record<string, HeardAnswer>>>

export function createRustWeek(ports: RustWeekPorts): RustWeek {
  const { week } = ports.week
  const picks = weekPicks(ports.storage)
  const openingSpec: OpeningSpec | null =
    ports.opening === true && week.opening !== undefined
      ? {
          version: week.opening.version,
          count: week.opening.exchanges.length,
        }
      : null
  const machine = weekMachine(week, {
    perPoint: ports.perPoint,
    decisions: ports.verdicts
      ? (): DecisionsSent => atSend(week, ofWeek(picks.list() ?? [], week.id))
      : null,
    opening: openingSpec,
    msOf: (id) => takeMs(ports.takes.takes.getSnapshot(), id),
  })
  const bundle = bundleRuntime(machine, {
    takes: ports.takes,
    drafts: weekDrafts(ports.storage, week.id),
    records: weeksSent(ports.storage),
    context: () => null,
    home: ports.home,
    now: ports.now,
    newId: ports.newId,
    onVisibility: ports.onVisibility,
  })
  const sends = weeksSent(ports.storage)
  // What home's own record said this opening (RR30).
  let homeSaid: HomeWeekSent = HOME_UNKNOWN
  /**
   * Puts the takes on `ticket`, the flow's on screen, where they are on
   * another, and enters the cards from the brief.
   */
  const follow = (ticket: string): void => {
    const state = bundle.getSnapshot()
    const on = itemOf(machine.spec.items[state.index] ?? "").ticket
    if (on === ticket && state.screen === "cards") return
    const index = firstItemOf(machine.spec.items, ticket)
    if (index !== -1) bundle.dispatch({ type: "go", index })
  }
  const opening =
    openingSpec === null || week.opening === undefined
      ? null
      : openingRuntime(openingSpec, week.opening.exchanges, week.id, ports)
  const flow = ports.perPoint
    ? createFlow({
        week,
        openings: openingSpec?.count ?? 0,
        storage: ports.storage,
        now: ports.now,
        said: (ticket) => {
          const state = bundle.getSnapshot()
          // An opening's question: a take said now, or one home plays.
          const n = openingOf(ticket)
          if (n !== null) {
            return (
              machine.answered(state, ticket) === "said" ||
              opening?.homeHas(n) === true
            )
          }
          const forks =
            week.tickets.find(({ id }) => id === ticket)?.forks.length ?? 0
          return [
            ticket,
            ...Array.from({ length: forks }, (_, i) =>
              pointItem(ticket, i + 1)
            ),
          ].some((item) => machine.answered(state, item) === "said")
        },
        // The takes follow the ticket on screen, so its voice opens on it.
        onTicket: (ticket) => follow(ticket),
        onReview: () => bundle.dispatch({ type: "review" }),
      })
    : null
  const readAtHome = (): WeekAtHome =>
    weekAtHome(sends.list() ?? [], week, ports.homeHolds, homeSaid)
  let atHome = readAtHome()
  let atHomeOf: WeekSent | null = null
  const homeListeners = new Set<() => void>()
  /** Reads what home holds again, once a Send changes what was sent. */
  const lookHome = (force = false): void => {
    const { sent } = bundle.getSnapshot()
    if (!force && sent === atHomeOf) return
    atHomeOf = sent
    const next = readAtHome()
    if (
      next.holds?.at === atHome.holds?.at &&
      next.last?.at === atHome.last?.at &&
      next.homeSaid === atHome.homeSaid &&
      next.elsewhere === atHome.elsewhere
    ) {
      return
    }
    atHome = next
    for (const listener of homeListeners) listener()
  }
  const words = heardWords(ports.storage)
  const fromStore = (): WeekHeard =>
    Object.fromEntries(
      Object.entries(words.read()).map(([take, text]) => [
        take,
        { kind: "heard" as const, text: text ?? "" },
      ])
    )
  let snapshot = fromStore()
  const listeners = new Set<() => void>()

  const answered = (take: string, answer: HeardAnswer): void => {
    if (answer.kind === "heard") words.add(take, answer.text)
    snapshot = { ...snapshot, [take]: answer }
    for (const listener of listeners) listener()
  }

  /**
   * Asks home, once, for the words of each take sent that has none yet, one
   * after another: the link runs one request at a time, and answers any
   * other with busy.
   */
  const askSent = async (): Promise<void> => {
    // The last send's takes, and those of the send home holds, which a
    // closed week reads back.
    const takes = new Set(
      [bundle.getSnapshot().sent, atHome.holds].flatMap(
        (sent) => sent?.answers.map(({ take }) => take) ?? []
      )
    )
    for (const take of takes) {
      if (snapshot[take]?.kind === "heard") continue
      answered(take, await ports.heard(take))
    }
  }

  /** Tells each ticket opened and left while the screen shows (`./opens`). */
  const watchOpens = (): (() => void) => {
    let open: Open = null
    let hidden = false
    const move = (now: OnScreen): void => {
      const next = stepOpens(open, now, new Date(ports.now()).toISOString())
      open = next.open
      for (const event of next.events) ports.engage(event)
    }
    const look = (): void => {
      const state = bundle.getSnapshot()
      // A place is the ticket's, whichever of its points is on screen (RR24).
      const ticket = itemOf(machine.spec.items[state.index] ?? "").ticket
      const place = week.tickets.findIndex(({ id }) => id === ticket)
      move(!hidden && state.screen === "cards" && place !== -1 ? place : null)
    }
    const stopState = bundle.subscribe(look)
    const stopSeen = ports.onVisibility((now) => {
      hidden = now
      look()
    })
    look()
    return (): void => {
      stopState()
      stopSeen()
      move(null)
    }
  }

  return {
    machine,
    bundle,
    flow,
    opening,
    paste: pasteRuntime(
      ports.takes,
      pasteStores(ports.storage),
      week.id,
      ports.now
    ),
    atHome: {
      getSnapshot: () => atHome,
      subscribe(listener): () => void {
        homeListeners.add(listener)
        return (): void => {
          homeListeners.delete(listener)
        }
      },
    },
    heard: {
      getSnapshot: () => snapshot,
      subscribe(listener): () => void {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
    },
    attach(): () => void {
      snapshot = fromStore()
      // Opening reads what is kept at once, so a week already sent holds
      // its last send here; one sent later in this opening is not asked.
      const detach = bundle.attach()
      lookHome(true)
      const stopHome = bundle.subscribe(() => lookHome())
      const stopHeld = ports.onHomeHolds(() => lookHome(true))
      // A closed week reads home's own record once each opening (RR30): what
      // counted is home's to say, not the link's memory of it. The words of
      // the send it names are asked after. A week with an opening reads it
      // too, open or closed (#3269): which take each question plays is
      // home's to say, never this phone's memory of it.
      const closed = isClosed(week, new Date(ports.now()).toISOString())
      const asking =
        ports.homeRecord !== undefined && (closed || opening !== null)
          ? ports.homeRecord(week.id).then((said) => {
              opening?.heardHome(said.opening)
              if (!closed) return
              homeSaid = said.sent
              lookHome(true)
            })
          : Promise.resolve()
      void asking.then(askSent)
      const stopOpening = opening?.attach() ?? ((): void => undefined)
      // The flow and the takes on one ticket, and a take never moved:
      // - a take under way, or asked from the look over (Redo, "say it",
      //   which open the cards on another item), brings the flow to its
      //   ticket's voice;
      // - Back from the look over, or a take's Later that moved the takes
      //   to another ticket, brings the takes back to the item the flow's
      //   ticket was on, else its first.
      let before = bundle.getSnapshot()
      const stopFollow = bundle.subscribe(() => {
        const was = before
        const state = bundle.getSnapshot()
        before = state
        if (flow === null || state.screen !== "cards") return
        const { steps, at } = flow.getSnapshot()
        const step = steps[at]
        if (step === undefined) return
        const ticket = itemOf(machine.spec.items[state.index] ?? "").ticket
        // A take under way is on screen at its voice, wherever it was asked.
        const asked =
          state.busy || (was.screen === "review" && was.index !== state.index)
        if (asked) {
          if (step.ticket === ticket && step.step === "voice") return
          const voice = steps.findIndex(
            (each) => each.ticket === ticket && each.step === "voice"
          )
          if (voice !== -1) flow.dispatch({ type: "go", index: voice })
          return
        }
        if (step.ticket === ticket) return
        // A tap from the look over on the item it already stood on (index
        // unchanged, not busy yet) would land here too, but can't be made:
        // the look over stands on another ticket than the flow's only at
        // the opening index, a ticket's own item, and offers no Redo on one
        // where takes go point by point (`index.tsx`, `redoes`).
        const left = itemOf(machine.spec.items[was.index] ?? "").ticket
        if (was.screen === "cards" && left === step.ticket) {
          bundle.dispatch({ type: "go", index: was.index })
        } else {
          follow(step.ticket)
        }
      })
      const stopOpens = watchOpens()
      return (): void => {
        stopOpening()
        stopFollow()
        stopOpens()
        stopHeld()
        stopHome()
        detach()
      }
    },
  }
}

type OpeningInner = OpeningRuntime & {
  /** Whether home's record names a take for question `n`. */
  readonly homeHas: (n: number) => boolean
  /** Home's record answered. */
  readonly heardHome: (home: HomeOpening) => void
  /** The screen is showing: the band follows the take under way. Returns the detach. */
  readonly attach: () => () => void
}

/**
 * The opening's runtime: home's record of it, a take from home playing
 * (`./opening`'s `stepPlayback`), and the band over the answer read (the
 * shared teleprompter's `stepPrompter`, fed the level of the take under
 * way, as the interview week's is).
 */
function openingRuntime(
  spec: OpeningSpec,
  exchanges: ReadonlyArray<{ readonly script: string }>,
  week: string,
  ports: RustWeekPorts
): OpeningInner {
  let view: OpeningView = {
    home: OPENING_UNKNOWN,
    playback: NOT_PLAYING,
    prompter: NO_PROMPTER,
    pace: paceOf(ports.pace?.read() ?? DEFAULT_PACE_WPM),
  }
  const listeners = new Set<() => void>()
  const set = (next: OpeningView): void => {
    if (next === view) return
    view = next
    for (const listener of listeners) listener()
  }
  // Each answer's words, counted once, by the line its takes answer.
  const totals = new Map(
    exchanges.map(({ script }, i) => [
      ticketLine(week, openingItem(i + 1)),
      totalOf(script.split("\n")),
    ])
  )
  const pattern = ports.takes.pattern
  /** Moves the band on what the recorder last measured. */
  const listen = (): void => {
    const { take, answers } = pattern.getSnapshot()
    const total = answers === null ? undefined : totals.get(answers)
    const prompter = stepPrompter(
      view.prompter,
      take.kind === "recording" && answers !== null && total !== undefined
        ? {
            type: "heard",
            script: answers,
            level: take.level,
            floor: HEARD_FLOOR,
            at: ports.now(),
            total,
            pace: view.pace,
          }
        : { type: "ended" }
    )
    if (prompter !== view.prompter) set({ ...view, prompter })
  }
  let playing: (() => void) | null = null
  const stopPlaying = (): void => {
    const stop = playing
    playing = null
    stop?.()
  }
  const move = (event: Parameters<typeof stepPlayback>[1]): void => {
    const playback = stepPlayback(view.playback, event)
    if (playback !== view.playback) set({ ...view, playback })
  }
  const play = async (take: string): Promise<void> => {
    const now = view.playback
    stopPlaying()
    if (
      (now.kind === "asking" || now.kind === "playing") &&
      now.take === take
    ) {
      move({ type: "stop" })
      return
    }
    move({ type: "play", take })
    const audio =
      ports.homeAudio === undefined || ports.player === undefined
        ? null
        : await ports.homeAudio(take).catch(
            () =>
              // Ignored: audio home can't give now is missed, which the page says.
              null
          )
    const asked = view.playback
    if (asked.kind !== "asking" || asked.take !== take) return
    if (audio === null || ports.player === undefined) {
      move({ type: "answered", take, found: false })
      return
    }
    const started = ports.player.play(audio)
    playing = started.stop
    move({ type: "answered", take, found: true })
    await started.ended
    if (playing === started.stop) playing = null
    move({ type: "ended", take })
  }
  return {
    spec,
    getSnapshot: () => view,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    play(take): void {
      void play(take)
    },
    stop(): void {
      stopPlaying()
      move({ type: "stop" })
    },
    pause(): void {
      const prompter = stepPrompter(view.prompter, { type: "pause" })
      if (prompter !== view.prompter) set({ ...view, prompter })
    },
    setPace(to): void {
      const pace = stepPace(view.pace, to)
      ports.pace?.write(pace)
      set({ ...view, pace })
    },
    homeHas: (n) =>
      view.home.kind === "known" &&
      view.home.takes.some(
        (each) => each.n === n && each.version === spec.version
      ),
    heardHome(home): void {
      set({ ...view, home })
    },
    attach(): () => void {
      const stop = pattern.subscribe(listen)
      return (): void => {
        stop()
        stopPlaying()
        move({ type: "stop" })
        set({
          ...view,
          prompter: stepPrompter(view.prompter, { type: "ended" }),
        })
      }
    },
  }
}

/** The week this phone plays at `at`; null when it holds none. */
export const currentWeek = (
  weeks: ReadonlyArray<HeldWeek>,
  at: number
): HeldWeek | null => weekOpenNow(weeks, ({ week }) => week.opens, at)
