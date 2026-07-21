import type { JSX, ReactNode } from "react"
import { Toaster } from "sonner"

import { OrchestratorWrapper } from "./orchestrator"
import { QueryProvider } from "./tanstack-query"
import { ThemeProvider } from "./theme"
import { TTSProvider } from "./tts"

export const AppProviders = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  return (
    <ThemeProvider>
      <QueryProvider>
        <TTSProvider>
          <OrchestratorWrapper>{children}</OrchestratorWrapper>
        </TTSProvider>
      </QueryProvider>
      <Toaster />
    </ThemeProvider>
  )
}
