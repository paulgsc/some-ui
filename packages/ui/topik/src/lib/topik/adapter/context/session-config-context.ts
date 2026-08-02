import { createContext, useContext } from "react"
import type { SpeechAdapter } from "@some-ui/speech"
import type {
  ITopikMetadataRepository,
  ITopikRepository,
} from "@topik/lib/topik"

export type SessionConfig = {
  topikRepository: ITopikRepository
  metadataRepository: ITopikMetadataRepository
  /**
   * Null where the host mounts no `<SpeechProvider>`. The session then runs
   * without spoken prompts rather than refusing to run - a Korean lesson
   * with no pronunciation is degraded, and one that throws is not a lesson.
   */
  speechAdapter: SpeechAdapter | null
}

const SessionConfigContext = createContext<SessionConfig | null>(null)

export const SessionConfigProvider = SessionConfigContext.Provider

export function useSessionConfig(): SessionConfig {
  const ctx = useContext(SessionConfigContext)
  if (!ctx) {
    // An internal invariant now, not a demand on hosts: `KoreanStudyPage`
    // provides this itself, so reaching here means a `useSessionConfig`
    // call escaped the applet it belongs to.
    throw new Error(
      "useSessionConfig must be used within KoreanStudyPage (or an explicit SessionConfigProvider)"
    )
  }
  return ctx
}
