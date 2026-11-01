/**
 * Where Studio's idea answers get their words (MIC10, #2428; IH1 in
 * `@some-ui/soundbites`' `lib/idea/hearing`): on a phone paired with home,
 * each answer is said as a take (`lib/idea-takes`), sent home as a voice
 * note, and home's words for it are asked for (`lib/home-link/heard`); on a
 * phone that isn't, the phone's recognizer listens as before
 * (`lib/device-listen`, LS1). Whether the phone can talk is asked once the
 * phone's pairing has been read, and the pairing is read again at each
 * "Say it", so a phone paired while the screen shows hears the next answer
 * through home.
 *
 * `@some-ui/soundbites` is the phone's alone, so its `homeHearing` is handed
 * in by the idea screens' routes (`routes/_dashboard/_apk/journal`), which
 * may import it. Phone-only (`build.paths.ts`).
 */
import type { HearingPorts, IdeaListener } from "@some-ui/soundbites"
import { onPageVisibility } from "@some-ui/voice-capture"

import { deviceListener } from "@/lib/device-listen"
import { homeLink, paired } from "@/lib/home-link"
import { askHeard } from "@/lib/home-link/heard"
import { ideaTakes } from "@/lib/idea-takes"

/** Home's hearing while `paired` says so, `device` otherwise. */
export function eitherListener(ports: {
  /** Settles once the phone's pairing has been read; never rejects. */
  loaded: () => Promise<void>
  paired: () => boolean
  home: IdeaListener
  device: IdeaListener
}): IdeaListener {
  const now = (): IdeaListener => (ports.paired() ? ports.home : ports.device)
  return {
    available: () => ports.loaded().then(() => now().available()),
    listen: (onWords, onReady, take) => now().listen(onWords, onReady, take),
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
    paired,
    home: {
      available: () => homeListener().available(),
      listen: (onWords, onReady, take) =>
        homeListener().listen(onWords, onReady, take),
    },
    device: deviceListener,
  })
}
