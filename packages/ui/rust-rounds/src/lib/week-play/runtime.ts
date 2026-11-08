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
import type {
  BundleHome,
  BundleMachine,
  BundleRuntime,
  BundleTakes,
  HeardAnswer,
} from "@some-ui/voice-capture"
import { bundleRuntime } from "@some-ui/voice-capture"

import { weekOpenNow } from "./open-now"
import type { PasteRuntime } from "./paste"
import { pasteRuntime } from "./paste"
import type { WeekKind } from "./spec"
import { weekMachine } from "./spec"
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
  /** Milliseconds since the epoch. */
  readonly now: () => number
  readonly newId: () => string
  readonly onVisibility: (listener: (hidden: boolean) => void) => () => void
}

export type RustWeek = {
  readonly machine: BundleMachine<WeekKind>
  readonly bundle: BundleRuntime<WeekKind>
  /** What home said of each take sent, by take, the same object while unchanged. */
  readonly heard: {
    readonly getSnapshot: () => WeekHeard
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
    const { sent } = bundle.getSnapshot()
    if (sent === null) return
    for (const { take } of sent.answers) {
      if (snapshot[take]?.kind === "heard") continue
      answered(take, await ports.heard(take))
    }
  }

  return {
    machine,
    bundle,
    paste: pasteRuntime(ports.takes, pasteStores(ports.storage), ports.now),
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
      // Opening reads what is kept at once, so a week already sent is on
      // the sent screen here; one sent later in this opening is not asked.
      const detach = bundle.attach()
      void askSent()
      return detach
    },
  }
}

/** The week this phone plays at `at` (`./open-now`); null when it holds none. */
export const currentWeek = (
  weeks: ReadonlyArray<HeldWeek>,
  at: number
): HeldWeek | null => weekOpenNow(weeks, ({ week }) => week.opens, at)
