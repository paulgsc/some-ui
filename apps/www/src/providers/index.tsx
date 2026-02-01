import type { JSX, ReactNode } from "react"

import { OrchestratorWrapper } from "./orchestrator"
import { QueryProvider } from "./tanstack-query"
import { TTSProvider } from "./tts"

export const AppProviders = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  return (
    <QueryProvider>
      <TTSProvider>
        <OrchestratorWrapper>{children}</OrchestratorWrapper>
      </TTSProvider>
    </QueryProvider>
  )
}
