import { useEffect, useState } from "react"
import type { CrosswordClueState } from "@input/hooks/use-create-crossword-puzzle"
import { clueEvents } from "@input/hooks/use-create-crossword-puzzle"
import type { ViewportResponse } from "@input/hooks/use-viewport-rotation-wasm"
import { viewportEvents } from "@input/hooks/use-viewport-rotation-wasm"

type Unsubscribe = () => void

export function useClueQueueEvents() {
  const [cluesQueue, setCluesQueue] = useState<CrosswordClueState>(() =>
    clueEvents.getState()
  )
  const [viewportStates, setViewportStates] = useState<
    Record<string, ViewportResponse["state"]>
  >({})

  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = []

    const unsubClueQueue = clueEvents.subscribe(
      (state) => state,
      (updatedState) => setCluesQueue(updatedState)
    )
    unsubscribers.push(unsubClueQueue)

    const unsubViewortState = viewportEvents.subscribe(
      (state) => state,
      (updatedState) => setViewportStates(updatedState)
    )
    unsubscribers.push(unsubViewortState)

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [setCluesQueue, setViewportStates])

  return {
    cluesQueue,
    viewportStates,
  }
}
