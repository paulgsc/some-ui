/**
 * The page the real-microphone suite opens: plays one case (`./cases`) on
 * the real `micRecorder`, which Chromium's fake device feeds with a clip,
 * and then on the simulated microphone scripted as that clip, each through
 * the same runner (`runTakeScenario`, which checks VC2 and VC3 on the way)
 * over the real take kit, in real time.
 *
 * What is real on the first run: `getUserMedia`, `MediaRecorder`, the level
 * meter's Web Audio, the take kit and its runner. What is not: the page's
 * visibility. Headless Chromium never hides a page (a minimized window, a
 * second tab and a popup each leave `visibilityState` at "visible"), so a
 * `hide` step sets `document.visibilityState` here and dispatches the
 * browser's `visibilitychange`, which each screen watches as a screen does
 * (`onPageVisibility`). How the Android WebView hides a page is CK7's
 * (#2369), not this suite's.
 */
import type { MicOwner, Recording, Take } from "@voice-capture/index"
import {
  HEARD_FLOOR,
  micRecorder,
  onPageVisibility,
  takeKit,
} from "@voice-capture/index"
import type {
  ScenarioMicrophone,
  ScenarioPage,
  ScenarioScreen,
} from "@voice-capture/testing"
import {
  kitScreens,
  runTakeScenario,
  simulatedMicrophone,
} from "@voice-capture/testing"

import type { CaseRun, SideRun, TakeCase, TakeSeen } from "./cases"
import { CLIP_SCRIPTS, scenarioOf, TAKE_CASES } from "./cases"

/** The screens' own bitrate (soundbites' `SOUNDBITE_BITS_PER_SECOND`). */
const BITS_PER_SECOND = 32_000

/** How often a wait looks to see whether everything has ended. */
const POLL_MS = 20

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Lets `ms` of real time pass, or less once the phone is at rest: no take
 * under way, the microphone free, nothing opening and nothing open, so
 * nothing is left to happen. That cuts short the runner's two settling
 * waits, each every deadline and the cap (over two minutes).
 */
async function elapse(ms: number, rest: () => boolean): Promise<void> {
  const until = performance.now() + ms
  do {
    await sleep(Math.min(POLL_MS, Math.max(0, until - performance.now())))
  } while (performance.now() < until && !rest())
}

/** A microphone, watched: what is opening, and what each take read and gave. */
type Watched = ScenarioMicrophone & {
  readonly opening: () => number
  readonly takes: () => Promise<ReadonlyArray<TakeSeen>>
}

async function decodedMs(blob: Blob): Promise<number | null> {
  const context = new AudioContext()
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer())
    return audio.duration * 1_000
  } catch {
    return null
  } finally {
    await context.close()
  }
}

function watched(microphone: ScenarioMicrophone): Watched {
  let opening = 0
  const handed: Array<{ readonly take: Take; readonly peak: number | null }> =
    []
  const seen = (recording: Recording): Recording => {
    let peak: number | null = null
    return {
      ...recording,
      // What the kit reads each tick, and the peak it keeps (`stepTakeKit`).
      level: (): number => {
        const level = recording.level()
        if (recording.metered?.() === true) peak = Math.max(peak ?? 0, level)
        return level
      },
      finish: async (): Promise<Take> => {
        const take = await recording.finish()
        handed.push({ take, peak })
        return take
      },
    }
  }
  return {
    open: microphone.open,
    opening: () => opening,
    startRecording: async (): Promise<Recording> => {
      opening += 1
      try {
        return seen(await microphone.startRecording())
      } finally {
        opening -= 1
      }
    },
    takes: () =>
      Promise.all(
        handed.map(
          async ({ take, peak }): Promise<TakeSeen> => ({
            bytes: take.blob.size,
            mimeType: take.mimeType,
            durationMs: take.durationMs,
            decodedMs: await decodedMs(take.blob),
            peak,
          })
        )
      ),
  }
}

/**
 * The real microphone: `micRecorder` as the screens make it, and every
 * stream `getUserMedia` hands it, to see what is still open.
 */
function chromiumMicrophone(): ScenarioMicrophone & {
  readonly tracks: () => ReadonlyArray<MediaStreamTrackState>
} {
  const streams: Array<MediaStream> = []
  const devices = navigator.mediaDevices
  const ask = devices.getUserMedia.bind(devices)
  devices.getUserMedia = async (constraints): Promise<MediaStream> => {
    const stream = await ask(constraints)
    streams.push(stream)
    return stream
  }
  const live = (stream: MediaStream): boolean =>
    stream.getTracks().some((track) => track.readyState === "live")
  return {
    startRecording: micRecorder({ bitsPerSecond: BITS_PER_SECOND }),
    open: () => streams.filter(live).length,
    tracks: () =>
      streams.flatMap((stream) =>
        stream.getTracks().map((track) => track.readyState)
      ),
  }
}

/** The page's visibility, which headless Chromium never changes itself. */
function pageVisibility(): ScenarioPage {
  let hidden = false
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  })
  const become = (to: boolean): void => {
    hidden = to
    document.dispatchEvent(new Event("visibilitychange"))
  }
  return { hide: () => become(true), show: () => become(false) }
}

/** Plays `take` on `microphone` over one take kit. */
async function play(
  take: TakeCase,
  microphone: Watched,
  page?: ScenarioPage
): Promise<SideRun> {
  const screens: Array<ScenarioScreen> = []
  const unwatch: Array<() => void> = []
  let owner: MicOwner | null = null
  const rest = (): boolean =>
    screens.every((screen) => !screen.underway()) &&
    owner?.holder() === null &&
    microphone.opening() === 0 &&
    microphone.open() === 0
  const run = await runTakeScenario(scenarioOf(take), {
    build: (phone) => {
      owner = phone.owner
      const built = kitScreens(takeKit, 1)(phone)
      screens.push(...built.screens)
      if (page !== undefined) {
        for (const screen of built.screens) {
          unwatch.push(
            onPageVisibility((hidden) => {
              if (hidden) screen.leave()
            })
          )
        }
      }
      return built
    },
    advance: (ms) => elapse(ms, rest),
    now: Date.now,
    microphone,
    page,
  })
  for (const stop of unwatch) stop()
  return {
    endings: run.endings.map(({ ending, said }) => ({ ending, said })),
    violations: run.violations.map(
      ({ property, detail }) => `${property} (${detail})`
    ),
    takes: await microphone.takes(),
    open: microphone.open(),
  }
}

window.playTakeCase = async (name: string): Promise<CaseRun> => {
  const take = TAKE_CASES.find((each) => each.name === name)
  if (take === undefined) throw new Error(`no case named "${name}"`)
  const chromium = chromiumMicrophone()
  const real = await play(take, watched(chromium), pageVisibility())
  const simulated = await play(
    take,
    watched(
      simulatedMicrophone({ now: Date.now, fallback: CLIP_SCRIPTS[take.clip] })
    )
  )
  return {
    real: { ...real, tracks: chromium.tracks() },
    simulated,
    floor: HEARD_FLOOR,
  }
}
