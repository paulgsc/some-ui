import type { JSX, ReactNode } from "react"

import { useAuthority } from "@/lib/authority"

import { OrchestratorWrapper } from "./orchestrator"
import { StudyNudgeWatcher } from "./study-nudge"
import { QueryProvider } from "./tanstack-query"
import { ThemeProvider } from "./theme"
import { AppToaster } from "./toaster"
import { TTSProvider } from "./tts"

export const AppProviders = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  // This tree renders on the public landing page and the passkey screen too,
  // not just the dashboard. `StudyNudgeWatcher` waits until the learner's data
  // authority is decided, then runs for both: on the account the server
  // delivers and the watcher reconciles its push subscription, on the device
  // the client's own policy reminds them while a tab is open, and nothing is
  // sent to anyone (`clientOwnsNudgeDelivery`).
  const decided = useAuthority().kind !== "pending"

  return (
    <ThemeProvider>
      <QueryProvider>
        {decided && <StudyNudgeWatcher />}
        <TTSProvider>
          <OrchestratorWrapper>{children}</OrchestratorWrapper>
        </TTSProvider>
      </QueryProvider>
      <AppToaster />
    </ThemeProvider>
  )
}
