import { createContext, useContext } from "react"
import type {
  ITopikMetadataRepository,
  ITopikRepository,
} from "@chat/lib/topik"
import type { UseAudioTTSReturn } from "some-ui-utils"

export type SessionConfig = {
  topikRepository: ITopikRepository
  metadataRepository: ITopikMetadataRepository
  audioTTS: UseAudioTTSReturn
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
