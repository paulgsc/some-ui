/**
 * The Topik study applet, and the shell that makes it mountable anywhere.
 *
 * ## Why the shell exists
 *
 * This applet is loaded through `@some-ui/content-registry`, which maps a
 * key to a lazily-imported component and renders it with whatever scene
 * props the host associated with that key. `RegistryEntry`'s props are
 * typed `any`, so nothing checks what a registry component needs - which
 * means "needs a React context its host must remember to mount" is a
 * requirement the type system cannot express and the host cannot discover.
 * It fails at runtime, in a lazy chunk, inside a viewport - the worst place
 * to learn about a missing provider.
 *
 * It is also the wrong shape. A host mounting `SessionConfigProvider` would
 * have to know that *this* registry key, alone among fifteen, needs one -
 * and know which repositories to build for it. That is precisely the
 * internal knowledge the registry indirection exists to remove.
 *
 * So the applet provides its own context and takes overrides as props,
 * which is what every other applet in this repo already does: honeycomb
 * defaults `words` to its bundled seed, `InterviewApp` takes an optional
 * `sessionConfig`. `<KoreanStudyPage />` with no props is a working applet;
 * a host that wants to inject repositories passes them.
 *
 * `useSessionConfig` still throws without a provider, and should: it is now
 * a genuine internal invariant that this shell guarantees, rather than a
 * demand on strangers.
 */

import type { JSX } from "react"
import { useMemo } from "react"
import { useOptionalSpeechAdapter } from "@some-ui/speech"
import { ChatPanel } from "@topik/components/topik/chat-panel"
import { QuizPanel } from "@topik/components/topik/quiz-panel"
import { SessionHeader } from "@topik/components/topik/session-header"
import {
  createTopikMetadataRepository,
  createTopikRepository,
  useKoreanStudyPageVM,
} from "@topik/lib/topik"
import type {
  ITopikMetadataRepository,
  ITopikRepository,
} from "@topik/lib/topik"
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"

/** Where the manifest lives when a host doesn't say otherwise. */
export const DEFAULT_TOPIK_MANIFEST_URL = "/topiks/manifest.json"

export type KoreanStudyPageProps = {
  /** Overrides the default HTTP-backed repository. */
  topikRepository?: ITopikRepository
  /** Overrides the default manifest repository. */
  metadataRepository?: ITopikMetadataRepository
  /** Ignored when `metadataRepository` is given. */
  manifestUrl?: string
}

/**
 * The applet proper. Assumes its context.
 *
 * Exported for the callers that legitimately own the whole config - a story
 * pinning fixtures, a test injecting fakes - which render it inside their
 * own `SessionConfigProvider`. Ordinary hosts render `KoreanStudyPage` and
 * pass the overrides they care about.
 */
export const KoreanStudySession = (): JSX.Element => {
  const vm = useKoreanStudyPageVM()

  return (
    <div className="dark topik absolute inset-0 topik flex flex-col dark:bg-background">
      <SessionHeader {...vm.header} />
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="w-80 xl:w-96 flex-shrink-0">
          <ChatPanel
            {...vm.chat}
            onPlay={vm.actions.startChat}
            onPause={vm.actions.pauseChat}
            onReset={vm.actions.resetSession}
            onJumpToMessage={vm.actions.jumpToMessage}
          />
        </div>
        <div className="flex-1 topik-card">
          <QuizPanel
            {...vm.quiz}
            onAnswerSubmit={vm.actions.submitAnswer}
            onNextQuestion={vm.actions.advanceQuestion}
            onAssessmentComplete={(passed) =>
              passed ? vm.actions.passBatch() : vm.actions.failBatch()
            }
          />
        </div>
      </div>
    </div>
  )
}

export const KoreanStudyPage = ({
  topikRepository,
  metadataRepository,
  manifestUrl = DEFAULT_TOPIK_MANIFEST_URL,
}: KoreanStudyPageProps = {}): JSX.Element => {
  /*
   * The one thing that is legitimately ambient. There is one pair of
   * speakers per page, so a page-wide speech session is the right shape -
   * but this applet must not require one. `useOptionalSpeechAdapter`
   * returns null where no `<SpeechProvider>` is mounted, and the session
   * below simply runs without spoken prompts. Silence is a degraded
   * lesson; a crash is not a lesson at all.
   */
  const speechAdapter = useOptionalSpeechAdapter()

  const value = useMemo(
    () => ({
      topikRepository: topikRepository ?? createTopikRepository(),
      metadataRepository:
        metadataRepository ?? createTopikMetadataRepository(manifestUrl),
      speechAdapter,
    }),
    [topikRepository, metadataRepository, manifestUrl, speechAdapter]
  )

  return (
    <SessionConfigProvider value={value}>
      <KoreanStudySession />
    </SessionConfigProvider>
  )
}
