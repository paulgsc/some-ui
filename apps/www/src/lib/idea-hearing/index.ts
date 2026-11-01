/**
 * Where Studio's idea answers get their words (MIC10, #2428; IH1 in
 * `@some-ui/soundbites`' `lib/idea/hearing`): on a phone paired with home,
 * each answer is said as a take (`lib/idea-takes`), sent home as a voice
 * note, and home's words for it are asked for (`lib/home-link/heard`); on a
 * phone that isn't, the phone's recognizer listens as before
 * (`lib/device-listen`, LS1). Whether the phone can talk is asked once the
 * phone's pairing has been read, and the pairing is read again at each
 * "Say it", so a phone paired while the screen shows hears the next answer
 * through home. Once home doesn't answer (the phone is away from it), the
 * answers for `AWAY_MS` go to the recognizer, or are typed on a phone
 * without one, instead of each being recorded for a home that can't hear
 * it (IH1).
 *
 * `@some-ui/soundbites` is the phone's alone, so its `homeHearing` is handed
 * in by the idea screens' routes (`routes/_dashboard/_apk/journal`), which
 * may import it. Phone-only (`build.paths.ts`).
 */
import type {
  HearingPorts,
  IdeaHome,
  IdeaListener,
  Listening,
} from "@some-ui/soundbites"
import { onPageVisibility } from "@some-ui/voice-capture"

import { deviceListener } from "@/lib/device-listen"
import { homeLink, pairingOf } from "@/lib/home-link"
import { askHeard } from "@/lib/home-link/heard"
import { ideaTakes } from "@/lib/idea-takes"

/**
 * Home's words for a take, by its id (`lib/home-link/heard`): what the idea
 * shelf asks for a said answer of a new idea with no words yet (ST26).
 */
export const ideaWords = askHeard

/**
 * How long after home didn't answer the answers skip it: a run of answers
 * said away from home, short enough that home is tried again soon after
 * the phone is back.
 */
export const AWAY_MS = 5 * 60_000

/**
 * Home's hearing while the phone holds a pairing, `device` otherwise, and
 * `device` for `AWAY_MS` after home's hearing ended with home not
 * answering, while the phone holds the same pairing.
 */
export function eitherListener(ports: {
  /** Settles once the phone's pairing has been read; never rejects. */
  loaded: () => Promise<void>
  /** The id of the pairing the phone holds now, or `null`. */
  pairing: () => string | null
  home: IdeaListener
  device: IdeaListener
  /** Milliseconds since the epoch. */
  now: () => number
}): IdeaListener {
  /** Home didn't answer: the pairing then, and until when it is skipped. */
  let away: { readonly pairing: string; readonly until: number } | null = null
  const home = (): boolean => {
    const pairing = ports.pairing()
    if (pairing === null) return false
    return away?.pairing !== pairing || ports.now() >= away.until
  }
  const which = (): IdeaListener => (home() ? ports.home : ports.device)
  return {
    available: () => ports.loaded().then(() => which().available()),
    listen: (onWords, onReady, take): Listening => {
      if (!home()) return ports.device.listen(onWords, onReady, take)
      const listening = ports.home.listen(onWords, onReady, take)
      return {
        ...listening,
        // Marked before the screen hears of it, so its next look at what
        // can listen (`available`) already skips home.
        done: listening.done.then((result) => {
          const pairing = ports.pairing()
          if (
            result.kind === "kept" &&
            result.why === "away" &&
            pairing !== null
          ) {
            away = { pairing, until: ports.now() + AWAY_MS }
          }
          return result
        }),
      }
    },
  }
}

/** One per page load, over the phone's one desk of idea takes. */
let home: IdeaListener | null = null

/**
 * The idea screens' listener: home hearing each take (`hear`, soundbites'
 * `homeHearing`, made on first use, so a route builds no desk until it
 * listens) while paired, the phone's recognizer otherwise.
 */
export function phoneIdeaListener(
  hear: (ports: HearingPorts) => IdeaListener
): IdeaListener {
  const homeListener = (): IdeaListener => {
    home ??= hear({
      takes: ideaTakes(),
      heard: askHeard,
      now: () => Date.now(),
      onVisibility: onPageVisibility,
    })
    return home
  }
  return eitherListener({
    loaded: () => homeLink().load(),
    pairing: () => pairingOf(),
    home: {
      available: () => homeListener().available(),
      listen: (onWords, onReady, take) =>
        homeListener().listen(onWords, onReady, take),
    },
    device: deviceListener,
    now: () => Date.now(),
  })
}

/**
 * Home, as a new idea's screen says where its idea goes (ST26): this phone
 * paired with it or not, read from the pairing it holds. Whether home
 * answers is the drain's to learn once ideas go home whole.
 */
export const ideaHome: IdeaHome = {
  reach: () => (pairingOf() === null ? "unpaired" : "near"),
  subscribe: (listener) => homeLink().subscribe(listener),
}
