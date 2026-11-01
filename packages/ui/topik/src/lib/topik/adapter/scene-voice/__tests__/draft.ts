/**
 * A scene's draft for topik's tests, as every screen's tests have the
 * microphone: `@some-ui/voice-capture/testing`'s simulated pattern, with the
 * scene's options (many notes beside each other), its notes in memory. It
 * answers on the timers a test fakes.
 */
import type { PatternTake } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"
import type { SimulatedPattern } from "@some-ui/voice-capture/testing"
import { simulatedPattern } from "@some-ui/voice-capture/testing"
import type {
  SceneVoice,
  SceneVoiceSnapshot,
} from "@topik/lib/topik/adapter/scene-voice"

const DRAFT = "next-scene"

/** A note already in the draft, kept on this phone, the `nth` minute of the day. */
export const draftNote = (
  id: string,
  durationMs: number,
  nth: number
): PatternTake => ({
  id,
  answers: DRAFT,
  durationMs,
  recordedAt: new Date(
    Date.parse("2026-11-01T00:00:00Z") + nth * 60_000
  ).toISOString(),
  standing: "current",
  kept: { place: "phone" },
})

export type TestDraft = SceneVoice & Omit<SimulatedPattern, "keeping">

export function sceneDraft(
  seed: ReadonlyArray<PatternTake> = [],
  room: { readonly full: boolean } = { full: false }
): TestDraft {
  const simulated = simulatedPattern({
    options: { ...ONE_TAKE, takes: { per: "many", max: 5 } },
    seed,
  })
  const { pattern, store } = simulated
  let from: ReadonlyArray<PatternTake> | null = null
  let taking = false
  let snapshot: SceneVoiceSnapshot | null = null
  const getSnapshot = (): SceneVoiceSnapshot => {
    const takes = store.getSnapshot()
    const now = pattern.getSnapshot().take.kind !== "idle"
    if (snapshot === null || takes !== from || now !== taking) {
      from = takes
      taking = now
      snapshot = {
        notes: takes
          .filter((take) => take.standing === "current")
          .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
          .map(({ id, durationMs }) => ({
            id,
            durationMs,
            mimeType: "audio/webm",
          })),
        takes,
        taking: now,
        full: room.full,
      }
    }
    return snapshot
  }
  return {
    ...simulated,
    answers: DRAFT,
    getSnapshot,
    subscribe: (listener) => {
      const stops = [store.subscribe(listener), pattern.subscribe(listener)]
      return (): void => {
        for (const stop of stops) stop()
      }
    },
    letGoScene: (): void => {
      for (const note of getSnapshot().notes) {
        pattern.letGo(note.id, "phone")
      }
    },
    letGo: (): void => undefined,
  }
}
