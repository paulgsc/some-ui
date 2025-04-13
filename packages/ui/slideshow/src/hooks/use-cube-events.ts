import { useEffect } from "react"
import type { Range as ValidNumbers } from "some-types-utils"

type Face = ValidNumbers<6>

type CubeEventTypes =
  | "rotate:next"
  | "rotate:prev"
  | "rotate:to"
  | "rotate:pause"

type CubeEventPayloads = {
  "rotate:next": undefined
  "rotate:prev": undefined
  "rotate:pause": undefined
  "rotate:to": { face: Face }
}

type Listener<T extends CubeEventTypes> = (
  payload: CubeEventPayloads[T]
) => void

class CubeEventBus {
  private listeners: Map<CubeEventTypes, Set<Listener<any>>> = new Map()

  public on<T extends CubeEventTypes>(
    eventType: T,
    listener: Listener<T>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }

    this.listeners.get(eventType)!.add(listener)

    // Return unsubscribe function
    return () => {
      const eventListeners = this.listeners.get(eventType)
      if (eventListeners) {
        eventListeners.delete(listener)
      }
    }
  }

  public emit<T extends CubeEventTypes>(
    eventType: T,
    payload: CubeEventPayloads[T]
  ): void {
    const eventListeners = this.listeners.get(eventType)

    if (eventListeners) {
      eventListeners.forEach((listener) => listener(payload))
    }
  }
}

// Create a singleton instance
export const cubeEventBus = new CubeEventBus()

type Options = {
  onNext: () => void
  onPrev: () => void
  onTogglePause: () => void
  onToFace: (face: Face) => void
}

export const useSubscribeToCubeEvents = ({
  onNext,
  onPrev,
  onTogglePause,
  onToFace,
}: Options) => {
  useEffect(() => {
    // Subscribe to events
    const unsubNext = cubeEventBus.on("rotate:next", () => onNext())
    const unsubPrev = cubeEventBus.on("rotate:prev", () => onPrev())
    const unsubPause = cubeEventBus.on("rotate:pause", () => onTogglePause())
    const unsubTo = cubeEventBus.on("rotate:to", ({ face }) => onToFace(face))

    return (): void => {
      unsubNext()
      unsubPrev()
      unsubPause()
      unsubTo()
    }
  }, [onNext, onPrev, onTogglePause, onToFace])
}
