import { useEffect, useState } from "react"
import type { CrosswordClueState } from "@input/hooks/use-create-crossword-puzzle"
import { clueEvents } from "@input/hooks/use-create-crossword-puzzle"

type Unsubscribe = () => void

export function useClueQueueEvents() {
  const [cluesQueue, setCluesQueue] = useState<CrosswordClueState>(() =>
    clueEvents.getState()
  )

  useEffect(() => {
    const unsubscribers: Array<Unsubscribe> = []

    const unsubClueQueue = clueEvents.subscribe(
      (state) => state,
      (updatedState) => setCluesQueue(updatedState)
    )
    unsubscribers.push(unsubClueQueue)

    return (): void => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [clueEvents])

  return {
    cluesQueue,
  }
}
