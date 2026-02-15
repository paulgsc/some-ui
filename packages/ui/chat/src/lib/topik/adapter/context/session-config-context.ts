import { createContext, useContext } from "react"
import type {
  ITopikMetadataRepository,
  ITopikRepository,
} from "@chat/lib/topik"

export type SessionConfig = {
  topikRepository: ITopikRepository
  metadataRepository: ITopikMetadataRepository
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
