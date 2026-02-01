import { StrictMode, useEffect, useState } from "react"
import { useOrchestrator } from "some-ui-utils"

// Orchestrator wrapper - wire the singleton connection for Storybook

export const OrchestratorWrapper = ({
  children,
}: {
  children: React.ReactNode
}) => {
  useOrchestrator({
    stream_id: "storybook",

    scenes: [], // Start with empty scenes (can be configured via CRM)

    orchestratorUrl: `ws://${window.location.hostname}:3000/ws`,

    onSceneChange: (from, to) => {
      console.log(`[Storybook] Scene changed: ${from} → ${to}`)
    },

    onError: (error) => {
      console.error(`[Storybook] Orchestrator error:`, error)
    },

    onStreamEnd: () => {
      console.log(`[Storybook] Stream ended`)
    },
  })

  // Don't block rendering on orchestrator connection

  // Components can check connection status via store if needed

  return <>{children}</>
}
