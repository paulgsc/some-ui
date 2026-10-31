/**
 * The Topik study applet, and the shell that makes it mountable anywhere.
 *
 * `@some-ui/content-registry` renders a lazily-imported component with
 * whatever scene props the host gave its key, typed `any`, so a context the
 * host must remember to mount is a requirement nothing can check or
 * discover. The applet therefore provides its own context and takes
 * overrides as props: `<KoreanStudyPage />` with no props is a working
 * applet, and `useSessionConfig` throwing without a provider is an internal
 * invariant this shell guarantees.
 */

import type { JSX } from "react"
import { useMemo, useRef } from "react"
import { cn } from "@some-ui/core-utils"
import type { ActivityHost } from "@some-ui/react-hooks"
import { useHostHold } from "@some-ui/react-hooks"
import type { ShelfPort } from "@some-ui/shared"
import { useSpeaker } from "@some-ui/speech"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"
import { ChatPanel } from "@topik/components/topik/chat-panel"
import type { LessonOpening } from "@topik/components/topik/handheld/handheld-lesson"
import { HandheldLesson } from "@topik/components/topik/handheld/handheld-lesson"
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
import {
  SessionConfigProvider,
  useSessionConfig,
} from "@topik/lib/topik/adapter/context/session-config-context"
import type { SurfacePreference } from "@topik/lib/topik/adapter/hooks/use-surface"
import {
  chooseSurface,
  isShort,
  useElementBox,
} from "@topik/lib/topik/adapter/hooks/use-surface"
import type { LensTakes } from "@topik/lib/topik/adapter/lens-takes"
import type { FileShare } from "@topik/lib/topik/adapter/next-scene-share"
import type { RoutineFilesPort } from "@topik/lib/topik/adapter/routine-files"
import { createRoutineFeed } from "@topik/lib/topik/adapter/routine-files"
import type { SceneVoice } from "@topik/lib/topik/adapter/scene-voice"
import { createTreeFeed } from "@topik/lib/topik/adapter/tree-feed"

/** Where the manifest lives when a host doesn't say otherwise. */
const DEFAULT_TOPIK_MANIFEST_URL = "/topiks/manifest.json"

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
   * The served scene trees' manifest (`adapter/tree-feed`), which only the
   * handheld lesson reads; each tree loads through `loadTopik`. Absent, the
   * handheld lists no served trees.
   */
  loadTreeManifest?: () => Promise<unknown>
  /**
   * The learner shelf: where a lesson the learner pasted is kept on their
   * account when they ask (canon Rem. 7.3). A plain object for the same
   * reason as the loaders; `apps/www` passes one only with a passkey
   * session on a build with a `file_host`. Absent, nothing offers to keep.
   */
  shelf?: ShelfPort
  /**
   * Home's word sets and dramas from the reflections routine
   * (`adapter/routine-files`), which only the handheld lists. A plain object
   * for the same reason as the loaders; `apps/www` passes one with a
   * passkey session on a build with a `file_host`, and in the Android app
   * once its person chose to show them from the paired home, keyed by that
   * choice (`key`, carried into the feed). Absent, none are listed.
   */
  routineFiles?: RoutineFilesPort
  /** The Android app's share sheet (`FileShare`); absent, none is offered. */
  share?: FileShare
  /**
   * The Android app's microphone, for saying the next scene aloud
   * (`SceneVoice`); absent, the scene is typed.
   */
  sceneVoice?: SceneVoice
  /**
   * Where the learner's scene files wait, named by the host and shown on
   * "Open a scene from storage"; absent, none is named.
   */
  sceneFileHint?: string
  /**
   * Where the learner's word sets wait, named by the host and shown on
   * "Open new words from storage"; absent, none is named.
   */
  wordSetHint?: string
  /**
   * The Android app keeps the grammar lens's record for its study-context
   * export (adaptive-learning canon Rem. 4.18); absent, nothing is kept.
   */
  recordsLens?: boolean
  /**
   * The Android app's microphone, for the grammar lens's takes
   * (`LensTakes`, Rem. 4.16); absent, none is offered.
   */
  lensTakes?: LensTakes
  /**
   * Art direction. `inherit` — the default — renders in whatever theme the
   * host established, so the user's session theme reaches the applet.
   * `appearance="topik"` is the self-contained study surface: `.topik`
   * reassigns `--background` / `--foreground` for the subtree.
   */
  appearance?: Appearance
  /**
   * Which renderer to mount. `auto` - the default - picks by the room the
   * host granted: the handheld lesson below `md` width or 480px height, the
   * desktop session otherwise (see `use-surface`). The two are different
   * lessons, not two layouts of one (adaptive-learning canon Cor. 9.1).
   */
  surface?: SurfacePreference
  /**
   * The session it plays in (`ActivityHost`, `@some-ui/react-hooks`): the
   * read-aloud drill, the desktop conversation and the drama wait while it
   * waits (a stop, its own Pause, the reflection drawer), and the handheld
   * lesson keeps its open drill and sitting with it (promise SS2).
   */
  host?: ActivityHost
  /** `HandheldLesson`'s `initialOpen`. */
  opening?: LessonOpening
}

/**
 * The desktop session: transcript and quiz side by side, which is what keeps
 * its quiz open-book. Mounted only where that fits; below it, the handheld
 * lesson is mounted instead of this being stacked (canon Prop. 9.4).
 */
const DesktopSession = (): JSX.Element => {
  const vm = useKoreanStudyPageVM()

  return (
    <>
      <SessionHeader {...vm.header} />
      {/*
       * Still stacks below `md` for a host that forces this surface into a
       * narrow pane - where, per Prop. 9.4, it is then a closed-book quiz.
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
    </>
  )
}

/**
 * The applet proper. Assumes its context: `KoreanStudyPage` provides it,
 * and hosts render that with the overrides they care about.
 */
const KoreanStudySession = ({
  appearance = "inherit",
  surface: preference = "auto",
  opening,
}: {
  appearance?: Appearance
  surface?: SurfacePreference
  opening?: LessonOpening
} = {}): JSX.Element => {
  const paused = useHostHold(useSessionConfig().host)
  const root = useRef<HTMLDivElement>(null)
  const box = useElementBox(root)
  const surface = preference === "auto" ? chooseSurface(box) : preference

  return (
    <div
      ref={root}
      // A stable mount probe for hosts and tests, independent of the palette.
      data-slot="topik-session"
      data-surface={surface}
      className={cn(
        appearanceClassName(appearance),
        "absolute inset-0 flex flex-col bg-background"
      )}
    >
      {/*
       * Whichever renderer mounts fills the root and must stay inside it:
       * `min-h-0` down the flex chain is what keeps a tall pane from widening
       * the row past the height the host granted (docs/ui-fit).
       */}
      {surface === "handheld" ? (
        <HandheldLesson
          short={isShort(box)}
          paused={paused}
          {...(opening ? { initialOpen: opening } : {})}
        />
      ) : (
        <DesktopSession />
      )}
    </div>
  )
}

export const KoreanStudyPage = ({
  topikRepository,
  metadataRepository,
  manifestUrl = DEFAULT_TOPIK_MANIFEST_URL,
  loadManifest,
  loadTopik,
  loadTreeManifest,
  shelf,
  routineFiles,
  share,
  sceneVoice,
  sceneFileHint,
  wordSetHint,
  recordsLens,
  lensTakes,
  appearance = "inherit",
  surface = "auto",
  host,
  opening,
}: KoreanStudyPageProps = {}): JSX.Element => {
  /*
   * The one thing that is legitimately ambient. There is one pair of
   * speakers per page, so a page-wide speech session is the right shape -
   * but this applet must not require one. `useSpeaker`
   * returns null where no `<SpeechProvider>` is mounted, and the session
   * below simply runs without spoken prompts. Silence is a degraded
   * lesson; a crash is not a lesson at all.
   */
  const speaker = useSpeaker()

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
      speaker,
      ...(shelf ? { shelf } : {}),
      ...(routineFiles ? { routineFeed: createRoutineFeed(routineFiles) } : {}),
      ...(share ? { share } : {}),
      ...(sceneVoice ? { sceneVoice } : {}),
      ...(sceneFileHint ? { sceneFileHint } : {}),
      ...(wordSetHint ? { wordSetHint } : {}),
      ...(recordsLens ? { recordsLens } : {}),
      ...(lensTakes ? { lensTakes } : {}),
      ...(host ? { host } : {}),
      ...(loadTreeManifest && loadTopik
        ? { treeFeed: createTreeFeed(loadTreeManifest, loadTopik) }
        : {}),
    }),
    [
      topikRepository,
      metadataRepository,
      manifestUrl,
      loadManifest,
      loadTopik,
      loadTreeManifest,
      speaker,
      shelf,
      routineFiles,
      share,
      sceneVoice,
      sceneFileHint,
      wordSetHint,
      recordsLens,
      lensTakes,
      host,
    ]
  )

  return (
    <SessionConfigProvider value={value}>
      <KoreanStudySession
        appearance={appearance}
        surface={surface}
        opening={opening}
      />
    </SessionConfigProvider>
  )
}
