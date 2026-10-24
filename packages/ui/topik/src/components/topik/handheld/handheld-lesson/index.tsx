/**
 * The handheld Topik renderer: the phone's drama (docs/makjang/README.md).
 *
 * Not the desktop session made smaller. The desktop session plays a whole
 * conversation, then quizzes it beside the transcript; this renderer plays a
 * scene tree as a webtoon instead (`DramaLesson`), with a toggle for its
 * scenes' sound in the header: one the learner pasted or kept, or one of the
 * operator's served trees (`adapter/tree-feed`), which only this renderer
 * lists. It plays scene trees only: conversation files stay the desktop's.
 *
 * Read-aloud reads the word sets the learner added from storage
 * (`read-aloud/added-sets`). A set not opened yet waits
 * under "Ready for you", above everything else, and opens on its own words.
 *
 * What the reflections routine left on home (`adapter/routine-files`) is
 * listed under "From the routine", at the top, the ones not opened yet
 * first: a word set pair is added as two picked files are, a drama starts
 * as a picked scene does. An opened one stays listed, marked opened, since
 * home's list is the only way back to it.
 */

import type { JSX } from "react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { cn, dayOf } from "@some-ui/core-utils"
import { Button, KeepOnShelf, KeptShelf } from "@some-ui/shared"
import { CastSheet } from "@topik/components/topik/handheld/cast-sheet"
import { DramaLesson } from "@topik/components/topik/handheld/drama-lesson"
import { GenerateLesson } from "@topik/components/topik/handheld/generate-lesson"
import type {
  RoutineCard,
  StorageNote,
} from "@topik/components/topik/handheld/material-list"
import { MaterialList } from "@topik/components/topik/handheld/material-list"
import { RoutineStatus } from "@topik/components/topik/handheld/routine-status"
import { SharePrompt } from "@topik/components/topik/handheld/share-prompt"
import { ReadAloudScreen } from "@topik/components/topik/read-aloud/read-aloud-screen"
import { useSessionConfig } from "@topik/lib/topik/adapter/context/session-config-context"
import { useLessonPrompt } from "@topik/lib/topik/adapter/hooks/use-lesson-prompt"
import { usePastedTree } from "@topik/lib/topik/adapter/hooks/use-pasted-tree"
import { useSceneVoice } from "@topik/lib/topik/adapter/hooks/use-scene-voice"
import type { LastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import { createLastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import { createLensRecordStore } from "@topik/lib/topik/adapter/lens-record-store"
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  createPastedLessonStore,
  serializePastedTree,
  treeOfDocument,
} from "@topik/lib/topik/adapter/pasted-lesson"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import type {
  OpenedStore,
  RoutineFile,
} from "@topik/lib/topik/adapter/routine-files"
import {
  createOpenedStore,
  openedKey,
} from "@topik/lib/topik/adapter/routine-files"
import type { HeldRuns, RunLog } from "@topik/lib/topik/adapter/routine-runs"
import { useRoutineFiles } from "@topik/lib/topik/adapter/server/routine-files-queries"
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
import { titleOf } from "@topik/lib/topik/core/drama"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import type { Seed } from "@topik/lib/topik/core/feed-card"
import { routineView } from "@topik/lib/topik/core/routine-status"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
import { intakeTree } from "@topik/lib/topik/generation/tree-intake"
import {
  ADDED_SET_LIMIT,
  addSet,
  intakeSet,
  openSet,
  readySets,
  resolveSets,
  setLevel,
  wordsLeaving,
} from "@topik/lib/topik/read-aloud/added-sets"
import { ChevronLeft, Loader2, Music, Users } from "lucide-react"

type HandheldLessonProps = {
  /** Landscape phone: two columns, compact chrome. */
  short?: boolean
  /** The host's session is paused: read-aloud holds (`useReadAloud`). */
  paused?: boolean
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
  /** Injected in tests: the clock that dates an added set. */
  now?: () => Date
  /** Injected in tests; defaults to `localStorage`. */
  routineOpened?: OpenedStore
}

export const HandheldLesson = ({
  short = false,
  paused,
  lastDrama,
  pastedStore,
  readAloudStore,
  soundControl,
  tones,
  servedPoints,
  now = (): Date => new Date(),
  routineOpened,
}: HandheldLessonProps): JSX.Element => {
  const [held] = useState(() => pastedStore ?? createPastedLessonStore())
  const drama = usePastedTree(held)
  const [last] = useState(() => lastDrama ?? createLastDramaStore())
  const lessonPrompt = useLessonPrompt(last)
  // Writing one's own drama: from a card's seed, from nothing, or from a
  // picked file that did not play.
  const [generating, setGenerating] = useState<{
    seed?: Seed
    reply?: string
  } | null>(null)
  const {
    speaker,
    shelf,
    treeFeed,
    routineFeed,
    metadataRepository,
    share,
    sceneVoice,
    sceneFileHint,
    wordSetHint,
    recordsLens,
    lensTakes,
  } = useSessionConfig()
  const draft = useSceneVoice(sceneVoice)
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
    setGenerating(null)
    drama.start(tree)
  }
  // A picked file's text goes through the intake, as a paste does (MK4).
  const openSceneText = (text: string): void => {
    const intake = intakeTree(text)
    if (intake.status === "checked" && intake.findings.length === 0) {
      startTree(intake.lesson)
    } else {
      setGenerating({ reply: text })
    }
  }
  const leaveServed = (): void => setServedKey(null)
  const [readAloud] = useState(() => readAloudStore ?? createReadAloudStore())
  // Made once; whether it is kept is the host's call, at each render.
  const [lensRecord] = useState(createLensRecordStore)
  const [added, setAdded] = useState(() => readAloud.sets())
  const resolved = useMemo(() => resolveSets(added), [added])
  const [setNote, setSetNote] = useState<StorageNote | null>(null)
  const keepSets = (next: typeof added): void => {
    readAloud.saveSets(next)
    setAdded(next)
  }
  // Each text through the intake in turn, onto what the phone holds: all of
  // them are added, or none and `say` says why.
  const addSetTexts = (
    texts: ReadonlyArray<string>,
    say: (note: StorageNote) => void
  ): typeof added | null => {
    // Judged together first, so a group that doesn't fit says what the phone
    // holds now, not after its first set.
    const fresh = new Set(
      texts.flatMap((text) => {
        const intake = intakeSet(text, added)
        return intake.ok && !added.some((set) => set.deck.id === intake.deck.id)
          ? [intake.deck.id]
          : []
      })
    ).size
    if (
      added.length < ADDED_SET_LIMIT &&
      added.length + fresh > ADDED_SET_LIMIT
    ) {
      say({
        tone: "problem",
        text: `This phone keeps ${ADDED_SET_LIMIT} word sets and has ${added.length}, so these ${fresh} weren't added.`,
      })
      return null
    }
    let next = added
    const titles: Array<string> = []
    let dropped = 0
    for (const text of texts) {
      const intake = intakeSet(text, next)
      if (!intake.ok) {
        say({ tone: "problem", text: intake.error })
        return null
      }
      next = addSet(next, intake.deck, now().toISOString())
      titles.push(`"${intake.deck.title}"`)
      dropped += intake.dropped
    }
    const leaving = wordsLeaving(added, next)
    if (leaving.size > 0) {
      readAloud.prunePaces(
        Object.keys(readAloud.paces()).filter((id) => !leaving.has(id))
      )
    }
    keepSets(next)
    const what = titles.join(" and ")
    say({
      tone: "done",
      text:
        dropped > 0
          ? `Added ${what}. ${dropped} line${dropped === 1 ? "" : "s"} couldn't be read.`
          : `Added ${what}.`,
    })
    return next
  }
  const openSetText = (text: string): void => {
    addSetTexts([text], setSetNote)
  }
  // The read-aloud drill takes the whole screen, header included; leaving it
  // returns to the material list it was opened from. `set` is the added set
  // it reads on its own, or null for every word the phone has.
  // `begin`: a set the learner picked starts reading at once.
  const [reading, setReading] = useState<{
    set: string | null
    begin?: boolean
  } | null>(null)
  const routine = useRoutineFiles(routineFeed)
  const [opened] = useState(() => routineOpened ?? createOpenedStore())
  const [openedKeys, setOpenedKeys] = useState(opened.opened)
  const heldRuns = useHeldRuns(routineFeed?.runs, routineFeed?.key ?? "")
  const [routineNote, setRoutineNote] = useState<StorageNote | null>(null)
  const routineCards = useMemo(() => {
    const cards = (routine.data ?? []).map((file) =>
      routineCardOf(file, openedKeys.has(openedKey(file)))
    )
    return [
      ...cards.filter((card) => !card.opened),
      ...cards.filter((card) => card.opened),
    ]
  }, [routine.data, openedKeys])
  // A pair's sets the phone already holds are left as they are, record and
  // all; the rest are added, and the pair opens reading its first set.
  const openRoutineScene = (decks: ReadonlyArray<unknown>): boolean => {
    const texts = decks.map((deck) => JSON.stringify(deck))
    const ids = texts.map((text) => {
      const intake = intakeSet(text, added)
      return intake.ok ? intake.deck.id : null
    })
    const missing = texts.filter(
      (_, at) => !added.some((set) => set.deck.id === ids[at])
    )
    let held = added
    if (missing.length > 0) {
      const next = addSetTexts(missing, setRoutineNote)
      if (next === null) return false
      held = next
    }
    const first = ids[0]
    if (first == null) return false
    keepSets(openSet(held, first, now().toISOString()))
    setReading({ set: first, begin: true })
    return true
  }
  const openRoutine = (key: string): void => {
    const file = routine.data?.find((candidate) => openedKey(candidate) === key)
    if (file === undefined) return
    setRoutineNote(null)
    if (file.kind === "scene") {
      if (!openRoutineScene(file.decks)) return
    } else {
      startTree(file.tree)
    }
    opened.markOpened(key)
    setOpenedKeys(opened.opened())
  }
  const [castOpen, setCastOpen] = useState(false)

  if (reading) {
    const own =
      reading.set === null ? undefined : resolved.sets.get(reading.set)
    const deck = own ?? resolved.all
    return (
      <div
        data-slot="topik-handheld"
        data-short={short || undefined}
        className="flex size-full min-h-0 flex-col"
      >
        <ReadAloudScreen
          key={deck.id}
          topikLevel={own ? setLevel(own) : lessonPrompt.level}
          speech={speaker}
          store={readAloud}
          lensRecord={recordsLens ? lensRecord : undefined}
          lensTakes={lensTakes}
          deck={deck}
          lensDeck={own ?? resolved.lens}
          short={short}
          paused={paused}
          onExit={() => setReading(null)}
          initialBegin={reading.begin === true}
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
    ? titleOf(playing)
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
                : (): void => setGenerating(null)
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
        {playing && (
          <Button
            variant="ghost"
            className="h-11 shrink-0 gap-1 px-2"
            onClick={() => setCastOpen(true)}
          >
            <Users className="size-5" />
            <span lang="ko">등장인물</span>
          </Button>
        )}
        {playing && sound && soundState !== "withdrawn" && (
          <Button
            variant={soundState === "on" ? "secondary" : "ghost"}
            className={cn(
              "h-11 shrink-0 gap-1 rounded-full px-3",
              soundState === "off" && "text-muted-foreground"
            )}
            aria-pressed={soundState === "on"}
            onClick={() => control.set(soundState !== "on")}
          >
            <Music className="size-5" />
            <span lang="ko">효과음</span>
            <span lang="ko" aria-hidden="true" className="text-xs">
              {soundState === "on" ? "켬" : "끔"}
            </span>
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
            share && (
              <SharePrompt
                share={share}
                label="다음 화 쓰기"
                labelLang="ko"
                prompt={() => lessonPrompt.prompt({ level: heldLevel })}
                onShared={lessonPrompt.handedOff}
              />
            )
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
          initialSeed={generating.seed}
          initialReply={generating.reply}
          defaultLevel={heldLevel}
          buildPrompt={lessonPrompt.prompt}
          onPromptHandedOff={lessonPrompt.handedOff}
          onStartTree={startTree}
          share={share}
          sceneVoice={sceneVoice}
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
        onSeed={(seed) => setGenerating({ seed })}
        onSceneText={openSceneText}
        sceneFileHint={sceneFileHint}
        loading={!feed.isError && (feed.isLoading || lessons.isLoading)}
        error={feed.isError ? "Couldn't load the dramas." : null}
        onReload={() => void feed.refetch()}
        onCreate={() => setGenerating({})}
        draftNotes={draft?.notes.length ?? 0}
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
          speaker?.available === true
            ? (): void => setReading({ set: null })
            : undefined
        }
        addedSets={added.length}
        readySets={readySets(added).flatMap(({ deck }) => {
          const own = resolved.sets.get(deck.id)
          return own
            ? [
                {
                  id: deck.id,
                  title: deck.title,
                  words: own.words.length,
                  lines: own.lines.length,
                  level: setLevel(own),
                  ...(deck.from === undefined ? {} : { from: deck.from }),
                  ...(deck.practice === undefined
                    ? {}
                    : { practice: deck.practice }),
                  ...(deck.context === undefined
                    ? {}
                    : { context: deck.context }),
                },
              ]
            : []
        })}
        onOpenSet={(id) => {
          keepSets(openSet(added, id, now().toISOString()))
          setReading({ set: id, begin: true })
        }}
        onSetText={openSetText}
        setFileHint={wordSetHint}
        setNote={setNote}
        fromRoutine={routineCards}
        routineNote={routineNote}
        onOpenRoutine={openRoutine}
        {...(heldRuns === null
          ? {}
          : {
              routineStatus: (
                <RoutineStatus
                  view={routineView(heldRuns, openedKeys, now(), dayOf(now()))}
                  held={heldRuns}
                  today={dayOf(now())}
                />
              ),
            })}
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
      {playing && (
        <CastSheet
          lesson={playing}
          open={castOpen}
          onOpenChange={setCastOpen}
        />
      )}
    </div>
  )
}

const NO_SUBSCRIBE = (): (() => void) => () => {}
const NO_LOG = (): null => null

/** What the phone holds of the routine's runs from this home, or null with no log. */
function useHeldRuns(log: RunLog | undefined, key: string): HeldRuns | null {
  return useSyncExternalStore(
    log?.subscribe ?? NO_SUBSCRIBE,
    log === undefined ? NO_LOG : (): HeldRuns => log.held(key)
  )
}

/** A routine file as its card shows it; a drama names its own title and level. */
function routineCardOf(file: RoutineFile, opened: boolean): RoutineCard {
  return file.kind === "scene"
    ? {
        key: openedKey(file),
        kind: "scene",
        title: file.title,
        details: "Word sets: read aloud and grammar lens",
        opened,
      }
    : {
        key: openedKey(file),
        kind: "drama",
        title: titleOf(file.tree),
        details: `Drama · TOPIK ${file.tree.level}`,
        opened,
      }
}
