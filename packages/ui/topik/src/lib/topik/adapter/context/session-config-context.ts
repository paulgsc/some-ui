import { createContext, useContext } from "react"
import type { SpeechAdapter } from "@some-ui/speech"
import type {
  ITopikMetadataRepository,
  ITopikRepository,
} from "@topik/lib/topik"

export type SessionConfig = {
  topikRepository: ITopikRepository
  metadataRepository: ITopikMetadataRepository
  speechAdapter: SpeechAdapter
}

const SessionConfigContext = createContext<SessionConfig | null>(null)

export const SessionConfigProvider = SessionConfigContext.Provider

export function useSessionConfig(): SessionConfig {
  const ctx = useContext(SessionConfigContext)
  if (!ctx) {
    throw new Error("SessionConfigProvider missing")
  }
  return ctx
}
