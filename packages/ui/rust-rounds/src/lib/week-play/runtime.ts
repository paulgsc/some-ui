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
import type { HeldWeek } from "@rust-rounds/lib/weeks"
import type { KeyedStorage } from "@some-ui/core-utils"
import type { EngagementEvent } from "@some-ui/engagement"
import type {
  BundleHome,
  BundleMachine,
  BundleRuntime,
  BundleTakes,
  HeardAnswer,
} from "@some-ui/voice-capture"
import { bundleRuntime } from "@some-ui/voice-capture"

import { weekOpenNow } from "./open-now"
import type { OnScreen, Open } from "./opens"
import { stepOpens } from "./opens"
import type { PasteRuntime } from "./paste"
import { pasteRuntime } from "./paste"
import type { WeekAtHome, WeekKind, WeekSent } from "./spec"
import { weekAtHome, weekMachine } from "./spec"
import { heardWords, pasteStores, weekDrafts, weeksSent } from "./store"

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
  /** Milliseconds since the epoch. */
  readonly now: () => number
  readonly newId: () => string
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
  /** Where each opening of a ticket is told (`./opens`): the app's engagement sink. */
  readonly engage: (event: EngagementEvent) => void
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
  /** The screen is showing. Returns the detach. */
  readonly attach: () => () => void
}

/** Each take's words, or what home last said of them this opening. */
export type WeekHeard = Readonly<Partial<Record<string, HeardAnswer>>>

export function createRustWeek(ports: RustWeekPorts): RustWeek {
  const { week } = ports.week
  const machine = weekMachine(week)
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
  const readAtHome = (): WeekAtHome =>
    weekAtHome(sends.list() ?? [], week, ports.homeHolds)
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
      next.last?.at === atHome.last?.at
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
      move(!hidden && state.screen === "cards" ? state.index : null)
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
      void askSent()
      const stopOpens = watchOpens()
      return (): void => {
        stopOpens()
        stopHeld()
        stopHome()
        detach()
      }
    },
  }
}

/** The week this phone plays at `at` (`./open-now`); null when it holds none. */
export const currentWeek = (
  weeks: ReadonlyArray<HeldWeek>,
  at: number
): HeldWeek | null => weekOpenNow(weeks, ({ week }) => week.opens, at)
