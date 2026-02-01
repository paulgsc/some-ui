import type { JSX } from "react"
import { useOrchestrator } from "some-ui-utils"

// Orchestrator wrapper - wire the singleton connection for Storybook
export const OrchestratorWrapper = ({
  children,
}: {
  children: React.ReactNode
}): JSX.Element => {
  useOrchestrator({
    stream_id: "storybook",
    scenes: [], // Start with empty scenes (can be configured via CRM)
    orchestratorUrl: `ws://${window.location.hostname}:3000/ws`,
    onSceneChange: (from, to) => {
      // eslint-disable-next-line no-console
      console.log(
        `[Storybook] Scene changed: ${from ?? "null"} → ${to ?? "null"}`
      )
    },
    onError: (error) => {
      // eslint-disable-next-line no-console
      console.error(`[Storybook] Orchestrator error:`, error)
    },
  })

  // Don't block rendering on orchestrator connection
  // Components can check connection status via store if needed
  return <>{children}</>
}
