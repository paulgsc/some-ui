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
 * under "Ready for you" and opens on its own words.
 *
 * What the reflections routine left on home (`adapter/routine-files`) is
 * listed under "From the routine", at the top, as feed cards
 * (`core/lesson-feed`): the first few, the ones not opened yet first, and
 * the rest a search away. A scene offers its read-aloud set and its grammar
 * lens set as two sessions: either press adds the pair as two picked files
 * are, and opens that set. Its sets are not listed again under "Ready for
 * you". A drama starts as a picked scene does. An opened one stays listed,
 * marked opened, since home's list is the only way back to it.
 *
 * "What are you hungry for?" (`PortionMenu`, `core/portion`) serves one
 * thing of the size asked for from all of the above: a bite or a snack is
 * read aloud from its set's lines alone, a meal opens as its card would,
 * and dessert plays.
 */

import type { JSX } from "react"
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { assertNever, cn, dayOf } from "@some-ui/core-utils"
import { Button, KeepOnShelf, KeptShelf } from "@some-ui/shared"
import { AskScene } from "@topik/components/topik/handheld/ask-scene"
import { CastSheet } from "@topik/components/topik/handheld/cast-sheet"
import { DramaLesson } from "@topik/components/topik/handheld/drama-lesson"
import { GenerateLesson } from "@topik/components/topik/handheld/generate-lesson"
import type { StorageNote } from "@topik/components/topik/handheld/material-list"
import { MaterialList } from "@topik/components/topik/handheld/material-list"
import { PortionMenu } from "@topik/components/topik/handheld/portion-menu"
import {
  RoutineStatus,
  useHeldRuns,
} from "@topik/components/topik/handheld/routine-status"
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
import type { PortionOrderStore } from "@topik/lib/topik/adapter/portion-order"
import { createPortionOrderStore } from "@topik/lib/topik/adapter/portion-order"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import type { OpenedStore } from "@topik/lib/topik/adapter/routine-files"
import {
  createOpenedStore,
  openedKey,
} from "@topik/lib/topik/adapter/routine-files"
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
import type { LessonSession } from "@topik/lib/topik/core/lesson-feed"
import { lessonItems } from "@topik/lib/topik/core/lesson-feed"
import type { Dish } from "@topik/lib/topik/core/portion"
import {
  holdingsOf,
  holdsNew,
  openingOrder,
  portionDeck,
} from "@topik/lib/topik/core/portion"
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
import type { SetPractice } from "@topik/lib/topik/read-aloud/content"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"
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
  /** Injected in tests; defaults to `localStorage`. */
  portionOrder?: PortionOrderStore
  /**
   * "next": open on the next lesson, as its card's press would: the newest
   * the routine left that isn't opened, else the newest word set added and
   * not opened. With neither, the list. "menu": open on "What are you
   * hungry for?". Read once, on mount.
   */
  initialOpen?: LessonOpening
}

/** Where the handheld lesson opens (`HandheldLesson`'s `initialOpen`). */
export type LessonOpening = "next" | "menu"

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
  portionOrder,
  initialOpen,
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
    sceneAsk,
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
  // `lines`: a bite or a snack, read from those lines of the set alone.
  // `practice`: the session it opens on, where the set serves both.
  const [reading, setReading] = useState<{
    set: string | null
    begin?: boolean
    lines?: ReadonlyArray<string>
    practice?: SetPractice
  } | null>(null)
  const routine = useRoutineFiles(routineFeed)
  const [opened] = useState(() => routineOpened ?? createOpenedStore())
  const [openedKeys, setOpenedKeys] = useState(opened.opened)
  const heldRuns = useHeldRuns(routineFeed?.runs, routineFeed?.key ?? "")
  const [routineNote, setRoutineNote] = useState<StorageNote | null>(null)
  const routineItems = useMemo(
    () => lessonItems(routine.data ?? [], openedKeys, added),
    [routine.data, openedKeys, added]
  )
  // A pair's sets the phone already holds are left as they are, record and
  // all; the rest are added, and the pair opens on `session`, else its first.
  const openRoutineScene = (
    decks: ReadonlyArray<unknown>,
    session: LessonSession | undefined
  ): boolean => {
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
    const chosen = session?.id ?? ids[0]
    if (chosen == null) return false
    keepSets(openSet(held, chosen, now().toISOString()))
    setReading({
      set: chosen,
      begin: true,
      ...(session ? { practice: session.practice } : {}),
    })
    return true
  }
  /** Opens a scene on the set `setId`, else its read-aloud set; a drama plays. */
  const openRoutine = (key: string, setId?: string): void => {
    const file = routine.data?.find((candidate) => openedKey(candidate) === key)
    if (file === undefined) return
    setRoutineNote(null)
    if (file.kind === "scene") {
      const sessions =
        routineItems.find((item) => item.key === key)?.sessions ?? []
      const session =
        sessions.find((one) => one.id === setId) ??
        sessions.find((one) => one.practice === "read-aloud")
      if (!openRoutineScene(file.decks, session)) return
    } else {
      startTree(file.tree)
    }
    opened.markOpened(key)
    const nowOpened = opened.opened()
    setOpenedKeys(nowOpened)
    // Every listed one opened, so a filing lost on the way is told again.
    routineFeed?.tellOpened?.(
      (routine.data ?? []).map(openedKey).filter((one) => nowOpened.has(one))
    )
  }
  const canRead = speaker?.available === true
  /** Opens the next lesson; false when there is none to open. */
  const openNext = (): boolean => {
    const fromRoutine = routineItems.find(
      (item) => !item.opened && (item.kind === "drama" || canRead)
    )
    if (fromRoutine) {
      openRoutine(fromRoutine.key)
      return true
    }
    const ready = readySets(added).at(0)
    if (ready === undefined || !canRead) return false
    keepSets(openSet(added, ready.deck.id, now().toISOString()))
    setReading({ set: ready.deck.id, begin: true })
    return true
  }
  // The press the host already made, answered once, a double mount
  // included: the second would open the one after it. With nothing to open
  // yet, it waits for the first look at home to settle, then tries once more.
  const opening = useRef(initialOpen)
  const looking = routine.isFetching
  const openAsked = useEffectEvent((): void => {
    if (opening.current !== "next") return
    if (openNext() || !looking) opening.current = undefined
  })
  useEffect(() => {
    openAsked()
  }, [looking])
  const [castOpen, setCastOpen] = useState(false)
  // "What are you hungry for?", open with read-aloud's record as it stood
  // when it opened: what is served is judged against that.
  const [orders] = useState(() => portionOrder ?? createPortionOrderStore())
  const [menu, setMenu] = useState<{ tally: Tally } | null>(() =>
    initialOpen === "menu" ? { tally: readAloud.tally() } : null
  )
  const openMenu = (): void => setMenu({ tally: readAloud.tally() })
  const startDish = (dish: Dish): void => {
    setMenu(null)
    switch (dish.portion) {
      case "bite":
      case "snack": {
        setReading({
          set: dish.setId,
          begin: true,
          lines: dish.lines.map((line) => line.id),
        })
        return
      }
      case "meal": {
        if (dish.start.from === "routine") {
          openRoutine(dish.start.key)
        } else {
          keepSets(openSet(added, dish.start.id, now().toISOString()))
          setReading({ set: dish.start.id, begin: true })
        }
        return
      }
      case "dessert": {
        if (dish.start.from === "routine") openRoutine(dish.start.key)
        else drama.play()
        return
      }
      default: {
        assertNever(dish)
      }
    }
  }

  if (reading) {
    const set =
      reading.set === null ? undefined : resolved.sets.get(reading.set)
    const own = set && reading.lines ? portionDeck(set, reading.lines) : set
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
          {...(reading.practice ? { initialPractice: reading.practice } : {})}
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
        {playing || servedKey !== null || generating || menu ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={
              playing || servedKey !== null
                ? leave
                : generating
                  ? (): void => setGenerating(null)
                  : (): void => setMenu(null)
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
            sceneAsk && (
              <AskScene
                asks={sceneAsk}
                label="다음 화 쓰기"
                labelLang="ko"
                prompt={() => lessonPrompt.prompt({ level: heldLevel })}
                onAsked={lessonPrompt.handedOff}
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
    if (menu) {
      const held = holdingsOf({
        added,
        sets: resolved.sets,
        routine: routine.data ?? [],
        opened: openedKeys,
        pasted: drama.tree ? titleOf(drama.tree) : null,
        canRead,
      })
      return (
        <PortionMenu
          held={held}
          tally={menu.tally}
          now={now()}
          initialOrder={openingOrder(orders.last(), holdsNew(held, menu.tally))}
          onOrdered={orders.save}
          onStart={startDish}
          short={short}
        />
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
          sceneAsk={sceneAsk}
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
        // QO1: joins a reload already on its way. The default cancels it and
        // starts another, and `feed.list` never reads the cancel.
        onReload={() => void feed.refetch({ cancelRefetch: false })}
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
          canRead ? (): void => setReading({ set: null }) : undefined
        }
        addedSets={added.length}
        readySets={readySets(added).flatMap(({ deck }) => {
          const own = resolved.sets.get(deck.id)
          // A routine scene's set is on its card under "From the routine".
          const onCard = routineItems.some((item) =>
            item.sessions.some((session) => session.id === deck.id)
          )
          return own && !onCard
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
        onOrder={openMenu}
        fromRoutine={routineItems}
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
