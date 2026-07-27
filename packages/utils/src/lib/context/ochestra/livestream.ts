import type { ReactNode } from "react"

import type { Action, Reducer, Store } from "./ochestrated-store"

// Simplified UI Element Definition
export type UIElement = {
  id: string
  component: ReactNode
  duration?: number // Auto-hide after this duration (ms)
  data?: unknown // Any data to pass to component
}

// UI Schedule Entry
export type ScheduledUI = {
  element: UIElement
  showAt: number // Timestamp when to show (relative to stream start)
  hideAt?: number // Optional explicit hide time
}

// Core State
export type LivestreamState = {
  streamStartTime: number | null
  streamDuration: number // Total planned duration (ms)
  currentTime: number // Current timestamp
  isLive: boolean
  activeElements: Set<string> // Currently visible UI element IDs
  schedule: Array<ScheduledUI> // All scheduled UI elements
  intro: UIElement | null
  outro: UIElement | null
}

// Actions
type LivestreamAction =
  | { type: "START_STREAM"; payload: { startTime: number; intro?: UIElement } }
  | { type: "END_STREAM"; payload: { outro?: UIElement } }
  | { type: "UPDATE_TIME"; payload: { currentTime: number } }
  | { type: "SCHEDULE_UI"; payload: { scheduled: ScheduledUI } }
  | { type: "SHOW_UI"; payload: { elementId: string } }
  | { type: "HIDE_UI"; payload: { elementId: string } }
  | { type: "SET_DURATION"; payload: { duration: number } }
  | { type: "RESET" }

// Reducer
const livestreamReducer = (
  state: LivestreamState,
  action: LivestreamAction
): LivestreamState => {
  switch (action.type) {
    case "START_STREAM": {
      const { startTime, intro } = action.payload
      const newActive = new Set<string>()
      if (intro) newActive.add(intro.id)

      return {
        ...state,
        streamStartTime: startTime,
        currentTime: startTime,
        isLive: true,
        intro: intro || null, // Convert undefined to null
        activeElements: newActive,
      }
    }

    case "END_STREAM": {
      const { outro } = action.payload
      return {
        ...state,
        isLive: false,
        outro: outro || null, // Convert undefined to null
        activeElements: outro ? new Set([outro.id]) : new Set(),
      }
    }

    case "UPDATE_TIME": {
      const { currentTime } = action.payload
      if (!state.streamStartTime || !state.isLive)
        return { ...state, currentTime }

      const elapsedTime = currentTime - state.streamStartTime
      const newActive = new Set(state.activeElements)

      // Check schedule for elements to show/hide
      for (const scheduled of state.schedule) {
        const shouldShow = elapsedTime >= scheduled.showAt
        const shouldHide = scheduled.hideAt
          ? elapsedTime >= scheduled.hideAt
          : scheduled.element.duration
            ? elapsedTime >= scheduled.showAt + scheduled.element.duration
            : false

        if (shouldShow && !shouldHide) {
          newActive.add(scheduled.element.id)
        } else if (shouldHide) {
          newActive.delete(scheduled.element.id)
        }
      }

      // Auto-trigger outro if we're near the end
      if (state.outro && state.streamDuration > 0) {
        const outroStartTime =
          state.streamDuration - (state.outro.duration || 30000)
        if (elapsedTime >= outroStartTime) {
          newActive.clear()
          newActive.add(state.outro.id)
        }
      }

      return {
        ...state,
        currentTime,
        activeElements: newActive,
      }
    }

    case "SCHEDULE_UI": {
      const { scheduled } = action.payload
      return {
        ...state,
        schedule: [
          ...state.schedule.filter(
            (s) => s.element.id !== scheduled.element.id
          ),
          scheduled,
        ],
      }
    }

    case "SHOW_UI": {
      const { elementId } = action.payload
      return {
        ...state,
        activeElements: new Set([...state.activeElements, elementId]),
      }
    }

    case "HIDE_UI": {
      const { elementId } = action.payload
      const newActive = new Set(state.activeElements)
      newActive.delete(elementId)
      return {
        ...state,
        activeElements: newActive,
      }
    }

    case "SET_DURATION": {
      const { duration } = action.payload
      return {
        ...state,
        streamDuration: duration,
      }
    }

    case "RESET": {
      return {
        streamStartTime: null,
        streamDuration: 0,
        currentTime: 0,
        isLive: false,
        activeElements: new Set(),
        schedule: [],
        intro: null,
        outro: null,
      }
    }

    default: {
      return state
    }
  }
}

export type LivestreamOrchestratorType = {
  // Core controls
  startStream: (intro?: UIElement) => void
  endStream: (outro?: UIElement) => void
  updateTime: (currentTime: number) => void
  setDuration: (duration: number) => void

  // UI scheduling
  scheduleUI: (element: UIElement, showAt: number, hideAt?: number) => void

  // Manual UI controls
  showUI: (elementId: string) => void
  hideUI: (elementId: string) => void

  // Reset
  reset: () => void

  // Store access
  store: Store<LivestreamState, LivestreamAction>
}

// Create store function (you'll need to import your createStore)
export function createLivestreamOrchestrator(
  createStore: <T, A extends Action>(
    initial: T,
    reducer: Reducer<T, A>
  ) => Store<T, A>
): LivestreamOrchestratorType {
  const initialState: LivestreamState = {
    streamStartTime: null,
    streamDuration: 0,
    currentTime: 0,
    isLive: false,
    activeElements: new Set(),
    schedule: [],
    intro: null,
    outro: null,
  }

  const store = createStore(initialState, livestreamReducer)

  return {
    // Core controls
    startStream: (intro?: UIElement): void => {
      const startTime = Date.now()
      store.dispatch({ type: "START_STREAM", payload: { startTime, intro } })
    },

    endStream: (outro?: UIElement): void => {
      store.dispatch({ type: "END_STREAM", payload: { outro } })
    },

    updateTime: (currentTime: number): void => {
      store.dispatch({ type: "UPDATE_TIME", payload: { currentTime } })
    },

    setDuration: (duration: number): void => {
      store.dispatch({ type: "SET_DURATION", payload: { duration } })
    },

    // UI scheduling
    scheduleUI: (element: UIElement, showAt: number, hideAt?: number): void => {
      store.dispatch({
        type: "SCHEDULE_UI",
        payload: { scheduled: { element, showAt, hideAt } },
      })
    },

    // Manual UI controls
    showUI: (elementId: string): void => {
      store.dispatch({ type: "SHOW_UI", payload: { elementId } })
    },

    hideUI: (elementId: string): void => {
      store.dispatch({ type: "HIDE_UI", payload: { elementId } })
    },

    reset: (): void => {
      store.dispatch({ type: "RESET" })
    },

    // Store access
    store,
  }
}
