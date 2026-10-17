/**
 * The grammar-lens session for React (adaptive-learning canon Cor. 4.8): the
 * runtime (`lens/runtime`) made once per mount, its snapshot as state, and
 * the learner's taps as calls. It begins on mount: the session opens on the
 * learner's tap on read-aloud's start screen.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { holdOrShow, useHeld } from "@topik/lib/topik/adapter/hooks/use-held"
import type { LensAnswer } from "@topik/lib/topik/read-aloud/lens/items"
import type { LensTap } from "@topik/lib/topik/read-aloud/lens/machine"
import { createLensMachine } from "@topik/lib/topik/read-aloud/lens/machine"
import type {
  LensRuntime,
  LensRuntimeOptions,
  LensSnapshot,
} from "@topik/lib/topik/read-aloud/lens/runtime"
import { createLensRuntime } from "@topik/lib/topik/read-aloud/lens/runtime"

export type UseLensSessionOptions = LensRuntimeOptions & {
  /** The host's session is paused: the screen holds until it plays. */
  paused?: boolean
}

export type LensSessionVM = LensSnapshot & {
  /** Whether a cue can be heard here; without speech every cue is read. */
  audio: boolean
  answer: (answer: LensAnswer) => void
  probe: (answer: string) => void
  skipProbes: () => void
  situation: (chosen: number) => void
  next: () => void
  nextSet: () => void
  startSitting: () => void
  hearCue: () => void
  hearLine: () => void
}

export function useLensSession(options: UseLensSessionOptions): LensSessionVM {
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })
  const [snapshot, setSnapshot] = useState<LensSnapshot>(() => ({
    state: createLensMachine(),
    playing: null,
    cueRead: false,
  }))
  // Made on mount, as read-aloud's runner is (`useReadAloud`).
  const runtimeRef = useRef<LensRuntime | null>(null)

  useEffect(() => {
    const runtime = (runtimeRef.current ??= createLensRuntime(
      latest,
      setSnapshot
    ))
    // A remount finds the set begun, and only shows it again.
    runtime.begin()
    return (): void => {
      runtime.dispose()
    }
  }, [])
  useHeld(runtimeRef, options.paused)

  // A tap can begin a screen (a new sitting or set) under a hold the screen
  // before ignored, so the hold is applied again, as read-aloud's taps do.
  const send = (event: LensTap): void => {
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.dispatch({ ...event, at: runtime.now() })
    holdOrShow(runtime, latest.current.paused)
  }

  return {
    ...snapshot,
    audio: options.speech?.available === true,
    answer: (answer): void => send({ type: "answer", answer }),
    probe: (answer): void => send({ type: "probe", answer }),
    skipProbes: (): void => send({ type: "skip-probes" }),
    situation: (chosen): void => send({ type: "situation", chosen }),
    next: (): void => send({ type: "next" }),
    nextSet: (): void => send({ type: "next-set" }),
    startSitting: (): void => send({ type: "start-sitting" }),
    hearCue: (): void => runtimeRef.current?.hearCue(),
    hearLine: (): void => runtimeRef.current?.hearLine(),
  }
}
