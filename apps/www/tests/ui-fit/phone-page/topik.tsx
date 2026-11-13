/**
 * topik's handheld lesson on the phone page, for `../stays-put-topik.spec.ts`:
 * `KoreanStudyPage` held to its handheld surface, as the Android app mounts it
 * below 768px wide or 480px tall, on fakes. A voice that speaks each line
 * for a moment, so read-aloud and the drama's Listen are offered; a shelf in
 * this page's memory holding one kept drama, so "Your kept lessons" shows
 * its rows; and the phone's own asks for the next scene (`@/lib/scene-ask`)
 * over this page's `localStorage`, so a refused write is the phone's own
 * refusal; and the grammar lens's takes on the simulated microphone, each
 * take four seconds long. No served dramas and no routine: the walk reaches
 * a drama by pasting one, and a word set by picking its file.
 */
import type { JSX } from "react"
import type { SpeechAdapter, SpeechAdapterFactory } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
import type { LensTakes } from "@some-ui/topik"
// This page is its own build (`build:fit-phone`) and in no shipped bundle,
// so the eager edge the rule guards against costs nothing here.
// eslint-disable-next-line lazy-registry/no-eager-registry-import
import { KoreanStudyPage } from "@some-ui/topik"
import { ONE_TAKE } from "@some-ui/voice-capture"
import { simulatedPattern, SPEAKING } from "@some-ui/voice-capture/testing"

import { createSceneAsks } from "@/lib/scene-ask"
import { patternPort } from "@/lib/takes-desk"

import { memoryShelf } from "./shelf"

/** How long the fake voice takes over a line. */
const LINE_MS = 120

/** A voice that says each line in `LINE_MS`, and can always speak. */
const quickVoice: SpeechAdapterFactory = (): SpeechAdapter => {
  let pending = 0
  const lines = new Set<() => void>()
  return {
    id: "web-speech",
    supported: true,
    describe: () => ({
      platform: "browser",
      voice: "Fit",
      availability: "available",
    }),
    subscribe: () => () => undefined,
    get pending(): number {
      return pending
    },
    speak: (_text, options = {}) =>
      new Promise<void>((done, fail) => {
        pending += 1
        options.onStart?.()
        const end = (): void => {
          lines.delete(stop)
          pending -= 1
        }
        const timer = setTimeout(() => {
          end()
          options.onEnd?.()
          done()
        }, LINE_MS)
        const stop = (): void => {
          clearTimeout(timer)
          end()
          fail(new DOMException("stopped", "AbortError"))
        }
        lines.add(stop)
        options.signal?.addEventListener("abort", stop, { once: true })
      }),
    stop: (): void => {
      for (const stop of [...lines]) stop()
    },
    pause: () => undefined,
    resume: () => undefined,
    setVolume: () => undefined,
    setPlaybackRate: () => undefined,
    dispose: (): void => {
      for (const stop of [...lines]) stop()
    },
  }
}

/** A drama kept on the shelf before the walk began, as its own keep wrote it. */
const KEPT: ReadonlyArray<readonly [string, string]> = [
  [
    "fit-kept",
    JSON.stringify({ kind: "fit", note: "a kept drama the walk never plays" }),
  ],
]

/**
 * The grammar lens's takes as the phone's desk shapes them (www's
 * `lib/lens-takes`), through its port: many a line, the newest played,
 * never full here.
 */
function lensTakes(): LensTakes {
  const simulated = simulatedPattern({
    options: {
      ...ONE_TAKE,
      takes: { per: "many", max: 5, full: "refuse" },
      play: "latest",
    },
  })
  const speaking = { ...SPEAKING, durationMs: 4_000 }
  simulated.mic.script(speaking, speaking, speaking)
  const phone = {
    pattern: simulated.pattern,
    takes: simulated.store,
    full: (): boolean => false,
  }
  return patternPort({ phone: () => phone })
}

const shelf = memoryShelf({ seed: KEPT })
const sceneAsk = createSceneAsks({ storage: () => localStorage })
const takes = lensTakes()
const noManifest = (): Promise<unknown> =>
  Promise.resolve({ version: "1", topiks: [] })

const TopikHandheld = (): JSX.Element => (
  <SpeechProvider
    config={{
      mode: "static",
      language: "korean",
      adapters: { static: quickVoice },
    }}
  >
    {/* The room the session viewport gives the applet, which fills it. */}
    <div style={{ position: "relative", height: "100%", minHeight: 0 }}>
      <KoreanStudyPage
        surface="handheld"
        loadManifest={noManifest}
        shelf={shelf}
        sceneAsk={sceneAsk}
        lensTakes={takes}
        sceneFileHint="Look in Downloads/Dramas."
        wordSetHint="Look in Downloads/Word sets."
      />
    </div>
  </SpeechProvider>
)

export const TOPIK_FIXTURES = {
  "topik-handheld": TopikHandheld,
} satisfies Record<string, () => JSX.Element>
