import { useSyncExternalStore } from "react"

import type { LivestreamOrchestratorType } from "./livestream"

type UseLivestreamOrchestratorReturn = {
  // State
  isLive: boolean
  activeElements: Array<string>
  elapsedTime: number
  remainingTime: number
  progress: number

  // Actions (spread from orchestrator)
} & LivestreamOrchestratorType & {
    // Computed
    isElementActive: (elementId: string) => boolean
  }

export function useLivestreamOrchestrator(
  orchestrator: LivestreamOrchestratorType
): UseLivestreamOrchestratorReturn {
  const state = useSyncExternalStore(
    (callback) => orchestrator.store.subscribe((s) => s, callback),
    () => orchestrator.store.get()
  )

  const activeElements = Array.from(state.activeElements)
  const elapsedTime = state.streamStartTime
    ? state.currentTime - state.streamStartTime
    : 0
  const remainingTime =
    state.streamDuration > 0
      ? Math.max(0, state.streamDuration - elapsedTime)
      : 0

  return {
    // State
    isLive: state.isLive,
    activeElements,
    elapsedTime,
    remainingTime,
    progress: state.streamDuration > 0 ? elapsedTime / state.streamDuration : 0,

    // Actions
    ...orchestrator,

    // Computed
    isElementActive: (elementId: string): boolean =>
      state.activeElements.has(elementId),
  }
}

// Usage example:
/*
const orchestrator = createLivestreamOrchestrator(createStore)

// Setup
orchestrator.setDuration(60 * 60 * 1000) // 1 hour stream

// Schedule UI elements
orchestrator.scheduleUI(
  { id: "chat-overlay", component: ChatOverlay },
  5000, // Show 5 seconds after start
  55000 // Hide after 55 seconds
)

orchestrator.scheduleUI(
  { id: "donation-alert", component: DonationAlert, duration: 10000 },
  30000 // Show at 30 seconds, auto-hide after 10 seconds
)

// Start stream with intro
orchestrator.startStream({ 
  id: "intro", 
  component: IntroOverlay, 
  duration: 5000 
})

// In your render loop or timer:
orchestrator.updateTime(Date.now())
*/
