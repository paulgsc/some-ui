/**
 * The handheld Topik renderer: the phone's drama (docs/makjang/README.md).
 *
 * Not the desktop session made smaller. The desktop session plays a whole
 * conversation, then quizzes it beside the transcript; this renderer plays a
 * scene tree as a webtoon instead (`DramaLesson`), with a toggle for its
 * scenes' sound in the header: one the learner pasted or kept, or one of the
 * operator's served trees (`adapter/tree-feed`), which only this renderer
 * lists. It plays scene trees only: conversation files stay the desktop's.
 */

import type { JSX } from "react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import { Button, KeepOnShelf, KeptShelf } from "@some-ui/shared"
import { DramaLesson } from "@topik/components/topik/handheld/drama-lesson"
import { GenerateLesson } from "@topik/components/topik/handheld/generate-lesson"
import { MaterialList } from "@topik/components/topik/handheld/material-list"
import { SharePrompt } from "@topik/components/topik/handheld/share-prompt"
import { ReadAloudScreen } from "@topik/components/topik/read-aloud/read-aloud-screen"
import { useSessionConfig } from "@topik/lib/topik/adapter/context/session-config-context"
import { useLessonPrompt } from "@topik/lib/topik/adapter/hooks/use-lesson-prompt"
import { usePastedTree } from "@topik/lib/topik/adapter/hooks/use-pasted-tree"
import type { LastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import { createLastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  createPastedLessonStore,
  serializePastedTree,
  treeOfDocument,
} from "@topik/lib/topik/adapter/pasted-lesson"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { useTopikManifest } from "@topik/lib/topik/adapter/server/topik-metadata-queries"
import {
  useServedTree,
  useTreeFeed,
} from "@topik/lib/topik/adapter/server/tree-feed-queries"
import {
  LESSON_SHELF_WORDS,
  treeShelfKeyOf,
} from "@topik/lib/topik/adapter/shelf"
import type {
  SoundControl,
  ToneContextFactory,
} from "@topik/lib/topik/adapter/sound-port"
import {
  createSoundControl,
  feelingSound,
} from "@topik/lib/topik/adapter/sound-port"
import {
  createServedPointStore,
  pointsFor,
} from "@topik/lib/topik/adapter/tree-feed"
import { speakerVoice } from "@topik/lib/topik/adapter/voice-port"
import type { DramaLesson as Tree } from "@topik/lib/topik/core/drama"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
import { ChevronLeft, Loader2, Music } from "lucide-react"

type HandheldLessonProps = {
  /** Landscape phone: two columns, compact chrome. */
  short?: boolean
  /** Injected in tests and stories; defaults to `localStorage`. */
  lastDrama?: LastDramaStore
  /** Injected in tests and stories; defaults to `sessionStorage`. */
  pastedStore?: PastedLessonStore
  /** Injected in tests and stories; defaults to `localStorage`. */
  readAloudStore?: ReadAloudStore
  /** Injected in tests; defaults to `localStorage`. */
  soundControl?: SoundControl
  /** Injected in tests; defaults to the browser's `AudioContext`. */
  tones?: ToneContextFactory | null
  /** Injected in tests; defaults to `localStorage`. */
  servedPoints?: DramaPointStore
}

export const HandheldLesson = ({
  short = false,
  lastDrama,
  pastedStore,
  readAloudStore,
  soundControl,
  tones,
  servedPoints,
}: HandheldLessonProps): JSX.Element => {
  const [held] = useState(() => pastedStore ?? createPastedLessonStore())
  const drama = usePastedTree(held)
  const [last] = useState(() => lastDrama ?? createLastDramaStore())
  const lessonPrompt = useLessonPrompt(last)
  const [generating, setGenerating] = useState(false)
  const { speaker, shelf, treeFeed, metadataRepository, share } =
    useSessionConfig()
  const feed = useTreeFeed(treeFeed)
  // Keys are one namespace, so a tree the lessons' manifest also lists is a
  // lesson: a server from before `?activity=` (paulgsc/server#417) answers
  // the trees' manifest with its lessons. Those are not listed as dramas. A
  // lessons' manifest that fails to load guards nothing, and hides nothing.
  const lessons = useTopikManifest(metadataRepository, {
    enabled: treeFeed !== undefined,
  })
  const listed = lessons.data?.topiks ?? (lessons.isError ? [] : undefined)
  const dramas =
    feed.data && listed
      ? feed.data.filter(({ key }) => !listed.some((item) => item.key === key))
      : []
  // The served tree chosen from the list, by key; its intake loads below.
  const [servedKey, setServedKey] = useState<string | null>(null)
  const served = useServedTree(treeFeed, servedKey)
  const [servedPlace] = useState(() => servedPoints ?? createServedPointStore())
  const voice = useMemo(() => speakerVoice(speaker), [speaker])
  const [control] = useState(() => soundControl ?? createSoundControl())
  const sound = useMemo(
    () => feelingSound({ control, speaker, tones }),
    [control, speaker, tones]
  )
  const soundState = useSyncExternalStore(
    control.subscribe,
    control.state,
    control.state
  )
  const heldLevel =
    TOPIK_LEVELS.find((level) => level === lessonPrompt.level) ?? 1
  const startTree = (tree: Tree): void => {
    setGenerating(false)
    drama.start(tree)
  }
  const leaveServed = (): void => setServedKey(null)
  // The read-aloud drill takes the whole screen, header included; leaving it
  // returns to the material list it was opened from.
  const [reading, setReading] = useState(false)

  if (reading) {
    return (
      <div
        data-slot="topik-handheld"
        data-short={short || undefined}
        className="flex size-full min-h-0 flex-col"
      >
        <ReadAloudScreen
          topikLevel={lessonPrompt.level}
          speech={speaker}
          store={readAloudStore}
          short={short}
          onExit={() => setReading(false)}
        />
      </div>
    )
  }

  const servedTree =
    servedKey !== null && served.data?.status === "checked"
      ? served.data.lesson
      : null
  const playing = drama.playing ? drama.tree : servedTree
  const leave = drama.playing ? drama.leave : leaveServed

  const title = playing
    ? playing.root.place
    : servedKey !== null
      ? "Loading..."
      : generating
        ? "New drama"
        : "Korean listening"

  const header = (
    <header className="shrink-0">
      <div
        className={cn("flex items-center gap-2 px-2", short ? "h-11" : "h-14")}
      >
        {playing || servedKey !== null || generating ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={
              playing || servedKey !== null
                ? leave
                : (): void => setGenerating(false)
            }
            aria-label="Back to materials"
          >
            <ChevronLeft className="size-6" />
          </Button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1
            lang={playing ? "ko" : undefined}
            className="truncate text-base font-semibold"
          >
            {title}
          </h1>
        </div>
        {playing && sound && soundState !== "withdrawn" && (
          <Button
            variant={soundState === "on" ? "secondary" : "ghost"}
            size="icon"
            className={cn(
              "size-11 shrink-0",
              soundState === "off" && "text-muted-foreground"
            )}
            aria-pressed={soundState === "on"}
            aria-label="Scene sound"
            onClick={() => control.set(soundState !== "on")}
          >
            <Music className="size-5" />
          </Button>
        )}
      </div>
    </header>
  )

  const body = ((): JSX.Element => {
    if (playing) {
      return (
        <DramaLesson
          // A served tree reloaded under its id is new content: the drama
          // starts again from its kept place rather than read the new tree
          // with the old runtime.
          key={
            drama.playing ? playing.id : `${playing.id}:${served.dataUpdatedAt}`
          }
          lesson={playing}
          voice={voice}
          sound={sound}
          points={
            drama.playing || servedKey === null
              ? held.points
              : pointsFor(servedPlace, servedKey)
          }
          last={last}
          ending={
            share ? (
              <SharePrompt
                share={share}
                prompt={() => lessonPrompt.prompt({ level: heldLevel })}
                onShared={lessonPrompt.handedOff}
              />
            ) : undefined
          }
          short={short}
          onLeave={leave}
        />
      )
    }
    if (servedKey !== null) {
      const failed =
        served.isError ||
        (served.data !== undefined && served.data.status !== "checked")
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {failed ? (
            <>
              <p className="text-destructive text-sm">
                {served.isError
                  ? "Couldn't load this drama."
                  : "This drama can't be played."}
              </p>
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={leaveServed}
              >
                Back to materials
              </Button>
            </>
          ) : (
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          )}
        </div>
      )
    }
    if (generating) {
      return (
        <GenerateLesson
          defaultLevel={heldLevel}
          buildPrompt={lessonPrompt.prompt}
          onPromptHandedOff={lessonPrompt.handedOff}
          onStartTree={startTree}
          share={share}
          short={short}
          kept={
            shelf ? (
              <KeptShelf
                shelf={shelf}
                words={LESSON_SHELF_WORDS}
                replay={{ read: treeOfDocument, play: startTree }}
              />
            ) : undefined
          }
        />
      )
    }
    return (
      <MaterialList
        level={lessonPrompt.level}
        onLevel={lessonPrompt.chooseLevel}
        pastedTree={
          drama.tree
            ? {
                lesson: drama.tree,
                onPlay: drama.play,
                onForget: drama.forget,
              }
            : null
        }
        dramas={dramas}
        onPlay={setServedKey}
        loading={!feed.isError && (feed.isLoading || lessons.isLoading)}
        error={feed.isError ? "Couldn't load the dramas." : null}
        onReload={() => void feed.refetch()}
        onCreate={() => setGenerating(true)}
        keep={
          shelf && drama.tree ? (
            <KeepOnShelf
              key={drama.tree.id}
              shelf={shelf}
              words={LESSON_SHELF_WORDS}
              shelfKey={treeShelfKeyOf(drama.tree)}
              body={serializePastedTree(drama.tree)}
            />
          ) : undefined
        }
        // Read-aloud's audio is the rep: with no voice here it is not
        // offered at all (canon Cor. 4.6).
        onReadAloud={
          speaker?.available === true ? (): void => setReading(true) : undefined
        }
      />
    )
  })()

  return (
    <div
      data-slot="topik-handheld"
      data-short={short || undefined}
      className="flex size-full min-h-0 flex-col"
    >
      {header}
      {body}
    </div>
  )
}
