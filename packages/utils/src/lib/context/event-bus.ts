// Generic EventBus types
type EventMap = Record<string, unknown>
type Listener<T> = (payload: T) => void
type Unsubscribe = () => void

type ReturnOptions<Events extends Record<string, unknown>> = {
  on: <T extends keyof Events>(
    eventType: T,
    listener: Listener<Events[T]>
  ) => Unsubscribe
  emit: <T extends keyof Events>(eventType: T, payload: Events[T]) => void
}

// Create a functional event bus
export function createEventBus<
  Events extends EventMap,
>(): ReturnOptions<Events> {
  // Use a Map to store all event listeners
  const listeners = new Map<keyof Events, Set<Listener<Events[keyof Events]>>>()

  // Subscribe to an event
  function on<T extends keyof Events>(
    eventType: T,
    listener: Listener<Events[T]>
  ): Unsubscribe {
    if (!listeners.has(eventType)) {
      listeners.set(eventType, new Set())
    }

    // Type assertion is safe because we just ensured the Set exists
    const eventListeners = listeners.get(eventType)!
    // Need to cast because TypeScript can't preserve the specific T in the Set
    eventListeners.add(listener as Listener<Events[keyof Events]>)

    // Return unsubscribe function
    return () => {
      const currentListeners = listeners.get(eventType)
      if (currentListeners) {
        currentListeners.delete(listener as Listener<Events[keyof Events]>)
      }
    }
  }

  // Emit an event
  function emit<T extends keyof Events>(
    eventType: T,
    payload: Events[T]
  ): void {
    const eventListeners = listeners.get(eventType)
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        // Safe cast because we enforce types when adding listeners
        ;(listener as Listener<Events[T]>)(payload)
      })
    }
  }

  return { on, emit }
}

/**
*
*
// Example of another event bus for notifications
type NotificationEventPayloads = {
  "notification:show": { message: string; type: "success" | "error" | "info" }
  "notification:hide": { id: string }
  "notification:clear": undefined
}

export const notificationEvents = createEventBus<NotificationEventPayloads>()

// Hook for the notification system
type NotificationHookOptions = {
  onShow: (message: string, type: "success" | "error" | "info") => void
  onHide: (id: string) => void
  onClear: () => void
}

export function useSubscribeToNotificationEvents({
  onShow,
  onHide,
  onClear,
}: NotificationHookOptions): void {
  useEffect(() => {
    const unsubShow = notificationEvents.on(
      "notification:show",
      ({ message, type }) => onShow(message, type)
    )
    const unsubHide = notificationEvents.on("notification:hide", ({ id }) =>
      onHide(id)
    )
    const unsubClear = notificationEvents.on("notification:clear", () =>
      onClear()
    )

    return () => {
      unsubShow()
      unsubHide()
      unsubClear()
    }
  }, [onShow, onHide, onClear])
}
*
*
*/
