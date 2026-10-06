import type { JSX } from "react"

import { useMockOrchestrator } from "@/lib/orchestrator"

// Orchestrator wrapper - drives the shared orchestrator store with a
// client-only mock engine (no WebSocket, no backend) so tenant sessions can
// play entirely standalone. See lib/orchestrator's useMockOrchestrator for
// the simulated FSM/tick contract.
export const OrchestratorWrapper = ({
  children,
}: {
  children: React.ReactNode
}): JSX.Element => {
  useMockOrchestrator({
    stream_id: "tenant-session",
  })

  return <>{children}</>
}
