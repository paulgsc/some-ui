/**
 * A session's spoken reflections for tests, as the phone's are
 * (`lib/reflection-voice`), with the microphone the simulated one every
 * screen's tests share, the reflections' list and the audio shelf in memory,
 * and where each is kept as the test says. It answers on the timers a test
 * fakes (`vi.useFakeTimers`).
 */
import type { TakeKept } from "@some-ui/voice-capture"
import { microphoneOwner, ON_PHONE } from "@some-ui/voice-capture"
import type {
  SimulatedMicrophone,
  SimulatedPlayer,
} from "@some-ui/voice-capture/testing"
import {
  memoryShelf,
  simulatedMicrophone,
  simulatedPlayer,
} from "@some-ui/voice-capture/testing"

import type { ReflectionTakes } from "@/lib/reflection-voice/runtime"
import { createVoiceNote } from "@/lib/reflection-voice/runtime"
import type { KeepResult, Reflection } from "@/lib/session-reflection"

export type TestReflections = {
  readonly voice: ReflectionTakes
  readonly mic: SimulatedMicrophone
  readonly player: SimulatedPlayer
  readonly audio: ReturnType<typeof memoryShelf>
  /** The reflections as kept, newest first. */
  readonly kept: () => ReadonlyArray<Reflection>
  /** Where each is kept from now on, as the voice lane would say. */
  readonly where: (next: (id: string) => TakeKept) => void
}

export function testReflections(
  sessionId: string,
  {
    stores = (): KeepResult => "kept",
    standsAside = (): boolean => true,
    audio = memoryShelf(),
  }: {
    /** How the list answers a keep. */
    stores?: () => KeepResult
    /** Whether the list stores a take recorded again or set aside. */
    standsAside?: () => boolean
    audio?: ReturnType<typeof memoryShelf>
  } = {}
): TestReflections {
  const mic = simulatedMicrophone({ now: Date.now })
  const player = simulatedPlayer()
  let kept: ReadonlyArray<Reflection> = []
  let where: (id: string) => TakeKept = () => ON_PHONE
  const listeners = new Set<() => void>()
  const write = (next: ReadonlyArray<Reflection>): boolean => {
    kept = next
    for (const listener of listeners) listener()
    return true
  }
  const standAside =
    (standing: "earlier" | "set-aside") =>
    (id: string): boolean =>
      standsAside() &&
      write(
        kept.map((r) =>
          r.id === id && r.body.kind === "voice"
            ? { ...r, body: { ...r.body, standing } }
            : r
        )
      )
  let next = 0
  const voice = createVoiceNote(
    {
      startRecording: mic.startRecording,
      owner: microphoneOwner(),
      player,
      audio,
      read: () => kept,
      subscribe: (listener) => {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
      keep: (reflection): KeepResult => {
        const result = stores()
        if (result === "kept") write([reflection, ...kept])
        return result
      },
      supersede: standAside("earlier"),
      setAside: standAside("set-aside"),
      letGo: (ids) => {
        write(kept.filter((r) => !ids.includes(r.id)))
      },
      saving: () => undefined,
      now: Date.now,
      newId: () => `v${(next += 1)}`,
      kept: (id) => where(id),
    },
    sessionId
  )
  return {
    voice,
    mic,
    player,
    audio,
    kept: () => kept,
    where: (to): void => {
      where = to
      for (const listener of listeners) listener()
    },
  }
}
