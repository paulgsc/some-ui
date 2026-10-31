import { createContext, useContext } from "react"
import type { ShelfPort } from "@some-ui/shared"
import type { Speaker } from "@some-ui/speech"
import type { LensTakes } from "@topik/lib/topik/adapter/lens-takes"
import type { SceneAsk } from "@topik/lib/topik/adapter/next-scene-ask"
import type { RoutineFeed } from "@topik/lib/topik/adapter/routine-files"
import type { SceneVoice } from "@topik/lib/topik/adapter/scene-voice"
import type { TreeFeed } from "@topik/lib/topik/adapter/tree-feed"
import type {
  ITopikMetadataRepository,
  ITopikRepository,
} from "@topik/lib/topik/core/session-types"

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
  /**
   * What the reflections routine left on home (`adapter/routine-files`),
   * read by the handheld lesson only. Absent, it lists none.
   */
  routineFeed?: RoutineFeed
  /**
   * Asks the owner's home for the next scene (`adapter/next-scene-ask`):
   * the Android app's. Absent, the prompt goes by the clipboard alone.
   */
  sceneAsk?: SceneAsk
  sceneVoice?: SceneVoice
  sceneFileHint?: string
  wordSetHint?: string
  /**
   * The Android app keeps the grammar lens's record for its study-context
   * export (adaptive-learning canon Rem. 4.18); absent, nothing is kept.
   */
  recordsLens?: boolean
  /** The Android app's microphone, for the grammar lens's takes (Rem. 4.16). */
  lensTakes?: LensTakes
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
