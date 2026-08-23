import type { JSX, ReactNode } from "react"
import { Toaster } from "sonner"

import { useHasDecorativeSession } from "@/lib/auth-session"

import { OrchestratorWrapper } from "./orchestrator"
import { StudyNudgeWatcher } from "./study-nudge"
import { QueryProvider } from "./tanstack-query"
import { ThemeProvider } from "./theme"
import { TTSProvider } from "./tts"

export const AppProviders = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  // This tree renders on the public landing page and the passkey screen too,
  // not just the signed-in dashboard - `StudyNudgeWatcher` isn't rendered at
  // all until there is a session, so registering a service worker,
  // reconciling a push subscription, and polling every five minutes don't
  // happen for a visitor with no tenant workspace to watch yet. This is not
  // a security boundary (the server still decides who sees what) - it is
  // the client declining to do work whose result would be thrown away.
  const hasSession = useHasDecorativeSession()

  return (
    <ThemeProvider>
      <QueryProvider>
        {hasSession && <StudyNudgeWatcher />}
        <TTSProvider>
          <OrchestratorWrapper>{children}</OrchestratorWrapper>
        </TTSProvider>
      </QueryProvider>
      <Toaster />
    </ThemeProvider>
  )
}
