/**
 * Wiring only: the drama's runtime (`core/drama-runtime`) made once per
 * mounted lesson, its snapshot read with `useSyncExternalStore`, and the
 * line in flight stopped on unmount. What an event means is the runtime's.
 * Mount a new lesson with a new `key`.
 */

import { useEffect, useState, useSyncExternalStore } from "react"
import type { DramaLesson, SessionEvent } from "@topik/lib/topik/core/drama"
import type {
  DramaPorts,
  DramaSnapshot,
} from "@topik/lib/topik/core/drama-runtime"
import { DramaRuntime } from "@topik/lib/topik/core/drama-runtime"

export type UseDrama = DramaSnapshot & {
  dispatch: (event: SessionEvent) => void
  replay: (beatId: string) => void
}

export function useDrama(lesson: DramaLesson, ports: DramaPorts): UseDrama {
  // A runtime made once per mount, which is what the caller's `key` decides.
  const [runtime] = useState(() => new DramaRuntime(lesson, ports))
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )
  useEffect(() => runtime.dispose, [runtime])
  return { ...snapshot, dispatch: runtime.dispatch, replay: runtime.replay }
}
