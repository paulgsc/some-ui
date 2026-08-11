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
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"
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
import { cn } from "some-ui-utils"

/** Where the manifest lives when a host doesn't say otherwise. */
export const DEFAULT_TOPIK_MANIFEST_URL = "/topiks/manifest.json"

export type KoreanStudyPageProps = {
  /** Overrides the default HTTP-backed repository outright. */
  topikRepository?: ITopikRepository
  /** Overrides the default manifest repository outright. */
  metadataRepository?: ITopikMetadataRepository
  /** Ignored when `metadataRepository` is given. */
  manifestUrl?: string
  /**
   * Where the catalogue comes from, as a plain function.
   *
   * This is the seam a *registry* host can actually use. Passing a
   * repository means importing this package's factories, which would pull
   * the whole applet into the host's main bundle and undo the lazy import
   * the content registry exists for. A loader is an ordinary function the
   * host already has - `apps/www` passes one that fetches from `public/`
   * where a build serves it and resolves to an empty catalogue on GitHub
   * Pages, which ships no companion data.
   */
  loadManifest?: () => Promise<unknown>
  /** Same seam for a single topik's batches, keyed by its manifest key. */
  loadTopik?: (key: string) => Promise<unknown>
  /**
   * Art direction. `inherit` — the default — renders in whatever theme the
   * host established, so the user's session theme reaches the applet.
   *
   * This used to be hardcoded as `dark topik`, which is the reason changing
   * the session theme did nothing here: `.topik` reassigns `--background` /
   * `--foreground` for the subtree, and the bundled `dark` pinned every
   * `dark:*` utility on even under a light palette. `appearance="topik"`
   * restores the old self-contained study surface for a host that wants it.
   */
  appearance?: Appearance
}

/**
 * The applet proper. Assumes its context.
 *
 * Exported for the callers that legitimately own the whole config - a story
 * pinning fixtures, a test injecting fakes - which render it inside their
 * own `SessionConfigProvider`. Ordinary hosts render `KoreanStudyPage` and
 * pass the overrides they care about.
 */
export const KoreanStudySession = ({
  appearance = "inherit",
}: {
  appearance?: Appearance
} = {}): JSX.Element => {
  const vm = useKoreanStudyPageVM()

  return (
    <div
      // A stable hook for hosts and tests. The theme class used to double as
      // this, which is why removing it broke four tests that only wanted to
      // know whether the applet had mounted — a mount probe should not depend
      // on which palette is in play.
      data-slot="topik-session"
      className={cn(
        appearanceClassName(appearance),
        "absolute inset-0 flex flex-col bg-background"
      )}
    >
      <SessionHeader {...vm.header} />
      {/*
       * The body is the applet's own size-authority boundary: it hands each
       * pane a share of whatever height the host granted this root, and both
       * panes must stay inside it. `min-h-0` is what makes that true - a flex
       * item's automatic minimum size is its content, so without it a pane
       * whose content is tall silently widens the floor of this row past the
       * space it was allocated, and the row hands the excess to whatever is
       * painted below (docs/ui-fit).
       *
       * Stacked below `md`, where a 320px conversation rail plus a quiz pane
       * do not both fit the inline axis.
       */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 md:flex-row">
        <div className="min-h-0 w-full shrink-0 basis-2/5 md:w-80 md:basis-auto xl:w-96">
          <ChatPanel
            {...vm.chat}
            onPlay={vm.actions.startChat}
            onPause={vm.actions.pauseChat}
            onReset={vm.actions.resetSession}
            onJumpToMessage={vm.actions.jumpToMessage}
          />
        </div>
        <div className="topik-card min-h-0 min-w-0 flex-1">
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
  loadManifest,
  loadTopik,
  appearance = "inherit",
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
      // Precedence, most specific first: a repository the host built, a
      // loader the host supplied, then this package's own HTTP default.
      topikRepository:
        topikRepository ??
        (loadTopik
          ? createTopikRepository(loadTopik)
          : createTopikRepository()),
      metadataRepository:
        metadataRepository ??
        createTopikMetadataRepository(loadManifest ?? manifestUrl),
      speechAdapter,
    }),
    [
      topikRepository,
      metadataRepository,
      manifestUrl,
      loadManifest,
      loadTopik,
      speechAdapter,
    ]
  )

  return (
    <SessionConfigProvider value={value}>
      <KoreanStudySession appearance={appearance} />
    </SessionConfigProvider>
  )
}
