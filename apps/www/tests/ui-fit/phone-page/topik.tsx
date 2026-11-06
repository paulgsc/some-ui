/**
 * topik's handheld lesson on the phone page, for `../stays-put-topik.spec.ts`:
 * `KoreanStudyPage` held to its handheld surface, as the Android app mounts it
 * below 768px wide or 480px tall, on fakes. A voice that speaks each line
 * for a moment, so read-aloud and the drama's Listen are offered; a shelf in
 * this page's memory holding one kept drama, so "Your kept lessons" shows
 * its rows; and the phone's own asks for the next scene (`@/lib/scene-ask`)
 * over this page's `localStorage`, so a refused write is the phone's own
 * refusal. No served dramas and no routine: the walk reaches a drama by
 * pasting one, and a word set by picking its file.
 */
import type { JSX } from "react"
import type { ShelfItem, ShelfPort } from "@some-ui/shared"
import type { SpeechAdapter, SpeechAdapterFactory } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
// This page is its own build (`build:fit-phone`) and in no shipped bundle,
// so the eager edge the rule guards against costs nothing here.
// eslint-disable-next-line lazy-registry/no-eager-registry-import
import { KoreanStudyPage } from "@some-ui/topik"

import { createSceneAsks } from "@/lib/scene-ask"

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
const KEPT: ReadonlyArray<[string, string]> = [
  [
    "fit-kept",
    JSON.stringify({ kind: "fit", note: "a kept drama the walk never plays" }),
  ],
]

/** The account's shelf, in this page load's memory. */
function memoryShelf(): ShelfPort {
  const bodies = new Map<string, string>(KEPT)
  const item = (key: string): ShelfItem => ({
    key,
    contentHash: "0".repeat(64),
    savedAt: "2026-11-01T09:00:00.000Z",
  })
  return {
    list: (): ReturnType<ShelfPort["list"]> =>
      Promise.resolve({ items: [...bodies.keys()].map(item), cap: 20 }),
    read: (key): Promise<unknown> => {
      const body = bodies.get(key)
      if (body === undefined) return Promise.reject(new Error("not kept"))
      const parsed: unknown = JSON.parse(body)
      return Promise.resolve(parsed)
    },
    keep: (key, body): ReturnType<ShelfPort["keep"]> => {
      const had = bodies.get(key)
      bodies.set(key, body)
      return Promise.resolve({
        change:
          had === undefined ? "kept" : had === body ? "unchanged" : "replaced",
        item: item(key),
      })
    },
    remove: (key): Promise<void> => {
      bodies.delete(key)
      return Promise.resolve()
    },
  }
}

const shelf = memoryShelf()
const sceneAsk = createSceneAsks({ storage: () => localStorage })
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
        sceneFileHint="Look in Downloads/Dramas."
        wordSetHint="Look in Downloads/Word sets."
      />
    </div>
  </SpeechProvider>
)

export const TOPIK_FIXTURES = {
  "topik-handheld": TopikHandheld,
} satisfies Record<string, () => JSX.Element>
