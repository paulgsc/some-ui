import { createContext, useContext } from "react"
import type { ShelfPort } from "@some-ui/shared"
import type { Speaker } from "@some-ui/speech"
import type {
  ITopikMetadataRepository,
  ITopikRepository,
} from "@topik/lib/topik"
import type { TreeFeed } from "@topik/lib/topik/adapter/tree-feed"

export type SessionConfig = {
  topikRepository: ITopikRepository
  metadataRepository: ITopikMetadataRepository
  /**
   * Null where the host mounts no `<SpeechProvider>`. The session then runs
   * without spoken prompts rather than refusing to run - a Korean lesson
   * with no pronunciation is degraded, and one that throws is not a lesson.
   */
  speaker: Speaker | null
  /**
   * The learner shelf, where the host has one and a session to key it by
   * (`adapter/shelf`). Absent, nothing offers to keep a lesson, and the
   * applet is otherwise the same.
   */
  shelf?: ShelfPort
  /**
   * The served scene trees (`adapter/tree-feed`), read by the handheld
   * lesson only. Absent, it lists none.
   */
  treeFeed?: TreeFeed
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
