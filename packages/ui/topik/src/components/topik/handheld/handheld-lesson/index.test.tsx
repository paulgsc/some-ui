import type { JSX } from "react"
import type { Speaker } from "@some-ui/speech"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { EXERCISE_FRAMING } from "@topik/components/topik/handheld/drama-lesson/exercise-framing"
import type { ITopikMetadataRepository } from "@topik/lib/topik"
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"
import type { LastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import { createLastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import type { SceneAsk } from "@topik/lib/topik/adapter/next-scene-ask"
import type { FileShare } from "@topik/lib/topik/adapter/next-scene-share"
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  createPastedLessonStore,
  RETIRED_KEYS,
} from "@topik/lib/topik/adapter/pasted-lesson"
import type { PortionOrderStore } from "@topik/lib/topik/adapter/portion-order"
import { createPortionOrderStore } from "@topik/lib/topik/adapter/portion-order"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import type {
  OpenedStore,
  RoutineFeed,
  RoutineFile,
} from "@topik/lib/topik/adapter/routine-files"
import {
  createHeldAnswers,
  createOpenedStore,
  createRoutineFeed,
} from "@topik/lib/topik/adapter/routine-files"
import { createRunLog } from "@topik/lib/topik/adapter/routine-runs"
import type {
  SoundControl,
  ToneContextFactory,
} from "@topik/lib/topik/adapter/sound-port"
import { createSoundControl } from "@topik/lib/topik/adapter/sound-port"
import { fakeTones } from "@topik/lib/topik/adapter/sound-port/fake-tones"
import type { TreeFeed } from "@topik/lib/topik/adapter/tree-feed"
import { createServedPointStore } from "@topik/lib/topik/adapter/tree-feed"
import type { LastDrama } from "@topik/lib/topik/core/last-drama"
import {
  workedExample,
  workedLesson,
} from "@topik/lib/topik/generation/tree-intake/worked-example"
import { parseReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import {
  LEVEL_ONE_LENS_SET,
  LEVEL_ONE_SET,
  STARTER_SET,
} from "@topik/lib/topik/read-aloud/repo-sets"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { LessonOpening } from "."
import { HandheldLesson } from "."
import { fixtureMetadataRepository, fixtureTopikRepository } from "./fixture"

type RenderOptions = {
  metadataRepository?: ITopikMetadataRepository
  lastDrama?: LastDramaStore
  pastedStore?: PastedLessonStore
  client?: QueryClient
  // No voice by default: the ladder starts at Hangul (canon Def. 9.3).
  speaker?: Speaker | null
  readAloudStore?: ReadAloudStore
  soundControl?: SoundControl
  tones?: ToneContextFactory | null
  treeFeed?: TreeFeed
  servedPoints?: ReturnType<typeof createServedPointStore>
  share?: FileShare
  sceneAsk?: SceneAsk
  sceneFileHint?: string
  wordSetHint?: string
  routineFeed?: RoutineFeed
  routineOpened?: OpenedStore
  portionOrder?: PortionOrderStore
  initialOpen?: LessonOpening
}

function renderLesson({
  metadataRepository = fixtureMetadataRepository,
  lastDrama = createLastDramaStore(memoryStorage()),
  pastedStore = createPastedLessonStore(memoryStorage()),
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  speaker = null,
  readAloudStore,
  soundControl,
  tones,
  treeFeed,
  servedPoints = createServedPointStore(memoryStorage()),
  share,
  sceneAsk,
  sceneFileHint,
  wordSetHint,
  routineFeed,
  routineOpened = createOpenedStore(memoryStorage()),
  portionOrder = createPortionOrderStore(memoryStorage()),
  initialOpen,
}: RenderOptions = {}): { feedWith: (next: RoutineFeed) => void } {
  const tree = (feed = routineFeed): JSX.Element => (
    <QueryClientProvider client={client}>
      <SessionConfigProvider
        value={{
          topikRepository: fixtureTopikRepository,
          metadataRepository,
          speaker,
          ...(treeFeed ? { treeFeed } : {}),
          ...(share ? { share } : {}),
          ...(sceneAsk ? { sceneAsk } : {}),
          ...(sceneFileHint ? { sceneFileHint } : {}),
          ...(wordSetHint ? { wordSetHint } : {}),
          ...(feed ? { routineFeed: feed } : {}),
        }}
      >
        <HandheldLesson
          lastDrama={lastDrama}
          pastedStore={pastedStore}
          readAloudStore={readAloudStore}
          soundControl={soundControl}
          tones={tones}
          servedPoints={servedPoints}
          now={(): Date => new Date("2026-10-14T06:00:00.000Z")}
          routineOpened={routineOpened}
          portionOrder={portionOrder}
          {...(initialOpen ? { initialOpen } : {})}
        />
      </SessionConfigProvider>
    </QueryClientProvider>
  )
  const { rerender } = render(tree())
  return { feedWith: (next) => rerender(tree(next)) }
}

const voice = (say: Speaker["say"]): Speaker => ({
  available: true,
  say,
  stop: (): void => undefined,
  muted: false,
  subscribe: () => (): void => undefined,
  describe: () => ({
    platform: "browser",
    voice: null,
    availability: "available",
  }),
})

/** A store holding `record`, read at time 2. */
const holding = (extra: Partial<LastDrama> = {}): LastDramaStore => {
  const store = createLastDramaStore(memoryStorage(), () => 2)
  store.save({
    lessonId: "earlier",
    content: "x",
    level: 4,
    title: "회장님 댁 거실",
    at: 1,
    scenes: [{ id: "s0", place: "회장님 댁 거실", feeling: "tension" }],
    tries: [],
    ...extra,
  })
  return store
}

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

/** Picks a file on the card `label` names. jsdom's File has no `text()`; the phone's does. */
const pickFile = async (
  label: RegExp,
  text: () => Promise<string>,
  size = 1
): Promise<void> => {
  fireEvent.change(await screen.findByLabelText(label), {
    target: { files: [{ size, text }] },
  })
}

const NEW_WORDS = /Open new words from storage/

const writeYourOwnButton = (): Promise<HTMLElement> =>
  screen.findByRole("button", { name: /Write your own drama/ })

const writeYourOwn = async (): Promise<void> => {
  fireEvent.click(await writeYourOwnButton())
}

/** Opens the new drama's folded level and genre. */
const openLevelAndGenre = (): void => {
  fireEvent.click(screen.getByRole("button", { name: /Level and genre/ }))
}

afterEach(cleanup)

describe("HandheldLesson", () => {
  it("lists dramas only: no conversation, no score, nothing up next", async () => {
    renderLesson()
    const list = await screen.findByText("No dramas this week yet.")
    const screenText = list.closest("[data-slot='topik-handheld']")?.textContent
    expect(screenText).not.toMatch(EXERCISE_FRAMING)
    expect(screenText).not.toMatch(/Continue/)
    // Nor is the screen that writes one.
    await writeYourOwn()
    expect(document.body.textContent).not.toMatch(EXERCISE_FRAMING)
  })

  it("does not offer read-aloud without a voice (canon Cor. 4.6)", async () => {
    renderLesson()
    await writeYourOwnButton()
    expect(screen.queryByRole("button", { name: /Read aloud/ })).toBeNull()
  })

  it("has nothing to read aloud until a word set is added, and says where words come from", async () => {
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
    })
    await writeYourOwnButton()
    expect(screen.queryByRole("button", { name: /Read aloud/ })).toBeNull()
    expect(
      document.querySelector('[data-slot="read-aloud-empty"]')?.textContent
    ).toContain("Nothing to read yet. Open new words from storage")
    expect(screen.getByLabelText(/Open new words from storage/)).toBeTruthy()
  })

  it("asks the grammar lens about a lens set's lines from every set as one", async () => {
    const store = createReadAloudStore(memoryStorage())
    store.saveSets([
      { deck: LEVEL_ONE_SET, addedAt: "", openedAt: "" },
      { deck: LEVEL_ONE_LENS_SET, addedAt: "", openedAt: "" },
    ])
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
    })
    fireEvent.click(await screen.findByRole("button", { name: /^Read aloud/ }))
    fireEvent.click(screen.getByRole("button", { name: /grammar lens/i }))
    expect(document.querySelector('[data-slot="lens-card"]')).not.toBeNull()
  })

  it("opens the read-aloud drill at the level held, and comes back", async () => {
    const store = createReadAloudStore(memoryStorage())
    store.saveSets([
      { deck: STARTER_SET, addedAt: "", openedAt: "" },
      { deck: LEVEL_ONE_SET, addedAt: "", openedAt: "" },
    ])
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      // The last drama was at TOPIK 4.
      lastDrama: holding(),
    })
    const card = await screen.findByRole("button", { name: /Read aloud/ })
    expect(card.textContent).toContain("2 word sets")
    expect(card.textContent).toContain("TOPIK 3, the highest it reads")
    fireEvent.click(card)
    expect(
      document.querySelector('[data-slot="read-aloud-level"]')?.textContent
    ).toBe("TOPIK 3")
    expect(screen.getByRole("button", { name: /^Read aloud$/ })).toBeTruthy()
    expect(screen.getByLabelText("Your reading aloud")).toBeTruthy()
    click("Back")
    expect(await writeYourOwnButton()).toBeTruthy()
  })

  it("adds a word set from storage: it waits at the top, says what it answers, and opens on its own words", async () => {
    const store = createReadAloudStore(memoryStorage())
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      wordSetHint: "In Drive, look in Read aloud › sets",
    })
    expect(await screen.findByLabelText(NEW_WORDS)).toHaveAccessibleDescription(
      /In Drive, look in Read aloud › sets/
    )
    const pick = (text: string): Promise<void> =>
      pickFile(NEW_WORDS, () => Promise.resolve(text))

    await pick("not a word set")
    expect(await screen.findByText("That file isn't a word set.")).toBeTruthy()

    await pick(
      JSON.stringify({
        schemaVersion: 1,
        id: "plans-2",
        title: "Plans",
        from: 'your note on Oct 13: "move to level two"',
        words: [
          { id: "yaksok", lemma: "약속", gloss: "plans" },
          { id: "chingu", lemma: "친구", gloss: "friend" },
        ],
        lines: [
          {
            id: "plans",
            level: 2,
            korean: "친구 약속",
            english: "Plans with a friend",
            words: [
              { wordId: "chingu", surface: "친구", stemEnd: 2 },
              { wordId: "yaksok", surface: "약속", stemEnd: 2 },
            ],
          },
        ],
      })
    )
    expect(await screen.findByText('Added "Plans".')).toBeTruthy()
    const ready = screen.getByRole("button", { name: /^2 words New/ })
    expect(ready.textContent).toContain("TOPIK 2 · Plans")
    expect(ready.textContent).toContain(
      'From your note on Oct 13: "move to level two"'
    )
    expect(store.sets().map((set) => set.deck.id)).toEqual(["plans-2"])

    fireEvent.click(ready)
    expect(
      document.querySelector('[data-slot="read-aloud-level"]')?.textContent
    ).toBe("TOPIK 2")
    expect(store.sets()[0]?.openedAt).toBe("2026-10-14T06:00:00.000Z")
    // Picked, so reading starts with no start screen.
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy()

    click("Stop reading aloud")
    const card = await screen.findByRole("button", { name: /Read aloud/ })
    expect(card.textContent).toContain("1 word set")
    expect(screen.queryByRole("button", { name: /^2 words New/ })).toBeNull()
  })

  const routineDeck = (id: string, title: string): unknown => ({
    schemaVersion: 1,
    id,
    title,
    words: [{ id: `${id}-w`, lemma: "약속", gloss: "plans" }],
    lines: [
      {
        id: `${id}-l`,
        level: 2,
        korean: "약속",
        english: "Plans",
        words: [{ wordId: `${id}-w`, surface: "약속", stemEnd: 2 }],
      },
    ],
  })
  const routineScene = (decks: ReadonlyArray<unknown>): RoutineFile => ({
    kind: "scene",
    name: "scene-2026-10-13_morning_session-.json",
    title: "TOPIK 2 · 일상 · 약속",
    decks,
  })

  it("lists what the routine left as cards: a scene's read-aloud press adds the pair and reads, a drama plays, and both are marked opened", async () => {
    const store = createReadAloudStore(memoryStorage())
    const opened = createOpenedStore(memoryStorage())
    const files: ReadonlyArray<RoutineFile> = [
      {
        kind: "drama",
        name: "drama-20261013T145200123Z.json",
        tree: workedLesson(),
      },
      routineScene([
        routineDeck("plans-2", "Plans"),
        routineDeck("plans-2-lens", "Plans, lens"),
      ]),
    ]
    const told: Array<ReadonlyArray<string>> = []
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      routineFeed: {
        list: () => Promise.resolve(files),
        tellOpened: (keys) => told.push(keys),
      },
      routineOpened: opened,
    })
    const waiting = await screen.findByRole("region", {
      name: "From the routine",
    })
    // The scene offers each of its sets; the drama plays.
    expect(
      within(waiting)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual([
      `Play it: ${workedLesson().title ?? ""}`,
      "Read aloud: 약속",
      "Grammar lens: 약속",
    ])
    const scene = within(waiting).getAllByRole("listitem")[1]
    expect(scene?.textContent).toContain("TOPIK 2")
    expect(scene?.textContent).toContain("일상")

    fireEvent.click(
      within(waiting).getByRole("button", { name: "Read aloud: 약속" })
    )
    // One press adds the pair and starts reading its read-aloud set.
    expect(
      await screen.findByRole("button", { name: "Stop reading aloud" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy()
    expect(
      store
        .sets()
        .map((set) => set.deck.id)
        .sort()
    ).toEqual(["plans-2", "plans-2-lens"])
    click("Stop reading aloud")
    expect(
      await screen.findByText('Added "Plans" and "Plans, lens".')
    ).toBeTruthy()
    // Still listed, after the one not opened yet, and its lens set is on
    // its card, not listed again.
    const after = screen.getByRole("region", { name: "From the routine" })
    expect(
      within(after)
        .getAllByRole("listitem")
        .map((card) => card.textContent.includes("Opened"))
    ).toEqual([false, true])
    expect(
      within(after).getByRole("button", { name: "Read aloud: 약속" })
        .textContent
    ).toContain("1 word · Opened")
    expect(screen.queryByRole("region", { name: "Ready for you" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /^Play it: / }))
    expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
    expect([...opened.opened()].sort()).toEqual([
      "drama/drama-20261013T145200123Z.json",
      "scene/scene-2026-10-13_morning_session-.json",
    ])
    // Each open tells home every listed one opened, names only.
    expect(told).toEqual([
      ["scene/scene-2026-10-13_morning_session-.json"],
      [
        "drama/drama-20261013T145200123Z.json",
        "scene/scene-2026-10-13_morning_session-.json",
      ],
    ])
  })

  it("adds neither set of a pair one of which can't be read, says so under the routine's files, and leaves it not opened", async () => {
    const store = createReadAloudStore(memoryStorage())
    const opened = createOpenedStore(memoryStorage())
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      routineFeed: {
        list: () =>
          Promise.resolve([
            routineScene([
              routineDeck("plans-2", "Plans"),
              { schemaVersion: 1 },
            ]),
          ]),
      },
      routineOpened: opened,
    })
    const waiting = await screen.findByRole("region", {
      name: "From the routine",
    })
    fireEvent.click(within(waiting).getByRole("button"))
    expect(
      waiting.querySelector('[data-slot="routine-note"]')?.textContent
    ).toBe("That file isn't a word set.")
    expect(store.sets()).toEqual([])
    expect(opened.opened().size).toBe(0)
    expect(within(waiting).getByRole("button").textContent).not.toContain(
      "Opened"
    )
  })

  it("opens an opened pair again, leaving the sets the phone holds as they are", async () => {
    const store = createReadAloudStore(memoryStorage())
    const decks = [
      routineDeck("plans-2", "Plans"),
      routineDeck("plans-2-lens", "Plans, lens"),
    ]
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      routineFeed: { list: () => Promise.resolve([routineScene(decks)]) },
    })
    const waiting = await screen.findByRole("region", {
      name: "From the routine",
    })
    fireEvent.click(
      within(waiting).getByRole("button", { name: "Read aloud: 약속" })
    )
    click("Stop reading aloud")
    await screen.findByText('Added "Plans" and "Plans, lens".')
    const addedAt = store.sets().map((set) => set.addedAt)

    fireEvent.click(
      within(
        screen.getByRole("region", { name: "From the routine" })
      ).getByRole("button", { name: "Read aloud: 약속" })
    )
    expect(
      document.querySelector('[data-slot="read-aloud-level"]')
    ).not.toBeNull()
    expect(store.sets().map((set) => set.addedAt)).toEqual(addedAt)
    expect(
      store.sets().find((set) => set.deck.id === "plans-2")?.openedAt
    ).not.toBeNull()
  })

  it("opens a scene on its grammar lens set from the lens's own button", async () => {
    const store = createReadAloudStore(memoryStorage())
    const opened = createOpenedStore(memoryStorage())
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      routineOpened: opened,
      routineFeed: {
        list: () =>
          Promise.resolve([
            routineScene([
              { schemaVersion: 1, ...LEVEL_ONE_SET },
              { schemaVersion: 1, ...LEVEL_ONE_LENS_SET },
            ]),
          ]),
      },
    })
    const waiting = await screen.findByRole("region", {
      name: "From the routine",
    })
    const lens = within(waiting).getByRole("button", {
      name: "Grammar lens: 약속",
    })
    expect(lens.textContent).toContain(
      `${LEVEL_ONE_LENS_SET.lines.length} lines`
    )
    fireEvent.click(lens)
    expect(document.querySelector('[data-slot="lens-card"]')).not.toBeNull()
    expect(
      store.sets().find((set) => set.deck.id === LEVEL_ONE_LENS_SET.id)
        ?.openedAt
    ).not.toBeNull()
    expect(
      store.sets().find((set) => set.deck.id === LEVEL_ONE_SET.id)?.openedAt
    ).toBeNull()
    expect([...opened.opened()]).toEqual([
      "scene/scene-2026-10-13_morning_session-.json",
    ])
  })

  it("shows the routine's first few, and finds the rest by level, genre or title", async () => {
    const scene = (n: number, title: string): RoutineFile => ({
      kind: "scene",
      name: `scene-${n}.json`,
      title,
      decks: [
        routineDeck(`set-${n}`, `Set ${n}`),
        routineDeck(`set-${n}-lens`, `Set ${n}, lens`),
      ],
    })
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
      routineFeed: {
        list: () =>
          Promise.resolve([
            scene(1, "TOPIK 2 · comedy · What is this test"),
            scene(2, "TOPIK 1 · thriller · The clock keeps running"),
            scene(3, "TOPIK 2 · historical · Rice cakes on the road"),
            scene(4, "TOPIK 2 · family · Holiday food with grandmother"),
            scene(5, "TOPIK 1 · romance · A video lesson for two"),
          ]),
      },
    })
    const waiting = await screen.findByRole("region", {
      name: "From the routine",
    })
    const names = (): Array<string> =>
      within(waiting)
        .getAllByRole("listitem")
        .map(
          (card) =>
            card.querySelector('[data-slot="feed-title"]')?.textContent ?? ""
        )
    expect(names()).toEqual([
      "What is this test",
      "The clock keeps running",
      "Rice cakes on the road",
    ])
    expect(waiting.textContent).toContain(
      "3 of 5 shown, the ones not opened first. Search for the rest."
    )

    const search = within(waiting).getByRole("searchbox", {
      name: "Search the routine's lessons",
    })
    fireEvent.change(search, { target: { value: "topik 1" } })
    expect(names()).toEqual([
      "The clock keeps running",
      "A video lesson for two",
    ])
    expect(waiting.textContent).toContain("2 lessons found.")
    fireEvent.change(search, { target: { value: "noodles" } })
    expect(within(waiting).queryAllByRole("listitem")).toHaveLength(0)
    expect(waiting.textContent).toContain(
      "Nothing from the routine matches “noodles”."
    )
  })

  it("adds neither set of a pair the phone has no room for, and says what it holds", async () => {
    const store = createReadAloudStore(memoryStorage())
    store.saveSets(
      Array.from({ length: 49 }, (_, at) => {
        const parsed = parseReadAloudDeck(
          routineDeck(`held-${at}`, `Held ${at}`)
        )
        if (!parsed.ok) throw new Error(parsed.error)
        return { deck: parsed.deck, addedAt: "", openedAt: "" }
      })
    )
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      routineFeed: {
        list: () =>
          Promise.resolve([
            routineScene([
              routineDeck("plans-2", "Plans"),
              routineDeck("plans-2-lens", "Plans, lens"),
            ]),
          ]),
      },
    })
    const waiting = await screen.findByRole("region", {
      name: "From the routine",
    })
    fireEvent.click(
      within(waiting).getByRole("button", { name: "Grammar lens: 약속" })
    )
    expect(
      waiting.querySelector('[data-slot="routine-note"]')?.textContent
    ).toBe(
      "This phone keeps 50 word sets and has 49, so these 2 weren't added."
    )
    expect(store.sets()).toHaveLength(49)
  })

  it("lists nothing of an earlier home's once the feed's key moves on", async () => {
    const drama = (name: string): RoutineFile => ({
      kind: "drama",
      name,
      tree: workedLesson(),
    })
    let answer: (files: ReadonlyArray<RoutineFile>) => void = () => undefined
    const { feedWith } = renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
      routineFeed: {
        key: "pairing-1@1",
        list: () => Promise.resolve([drama("old.json"), drama("older.json")]),
      },
    })
    const waiting = await screen.findByRole("region", {
      name: "From the routine",
    })
    expect(within(waiting).getAllByRole("button")).toHaveLength(2)

    feedWith({
      key: "pairing-2@9",
      list: () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    })
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "From the routine" })
      ).toBeNull()
    )
    act(() => answer([drama("new.json")]))
    const fresh = await screen.findByRole("region", {
      name: "From the routine",
    })
    expect(within(fresh).getAllByRole("button")).toHaveLength(1)
  })

  it("lists nothing from the routine where the host reaches no home", async () => {
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
    })
    await screen.findByText("No dramas this week yet.")
    expect(
      screen.queryByRole("region", { name: "From the routine" })
    ).toBeNull()
  })

  it("says when the routine last ran and what it left, from what the phone kept, away from home too", async () => {
    const runs = createRunLog(memoryStorage())
    const held = createHeldAnswers(memoryStorage())
    const answer = {
      files: [
        {
          folder: "scene",
          name: "scene-a.json",
          file: {
            schema: "some-ui.routine-scene/1",
            title: "약속",
            decks: [
              routineDeck("plans-2", "Plans"),
              routineDeck("plans-2-lens", "Plans, lens"),
            ],
          },
        },
      ],
      runs: [
        {
          folder: "run",
          name: "run-reflections-20261013T160208Z.json",
          file: {
            schema: "some-ui.routine-run/1",
            routine: "reflections",
            startedAt: "2026-10-13T16:02:08Z",
            outcome: "done",
            found: { reflections: 1, prompts: 0 },
            added: [{ folder: "scene", name: "scene-a.json", title: "약속" }],
          },
        },
      ],
      at: "2026-10-14T05:00:00.000Z",
    }
    const { feedWith } = renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
      routineFeed: createRoutineFeed(
        { key: "home", list: () => Promise.resolve(answer) },
        runs,
        held
      ),
    })
    const mark = await screen.findByRole("button", {
      name: /^The routine: New from the routine: a word set/,
    })
    expect(mark.textContent).toContain("1 new")
    fireEvent.click(mark)
    expect(await screen.findByText(/Added a word set: 약속\.$/)).toBeTruthy()
    expect(
      screen.getByRole("region", { name: "What the mark says" })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    // Away from home: the look answers nothing, and what was kept still shows.
    feedWith(
      createRoutineFeed(
        { key: "home", list: () => Promise.resolve({ files: [] }) },
        runs,
        held
      )
    )
    expect(
      await screen.findByRole("button", { name: /^The routine: New/ })
    ).toBeTruthy()
    const kept = await screen.findByRole("region", {
      name: "From the routine",
    })
    expect(within(kept).getByRole("listitem").textContent).toContain("약속")
  })

  it("opens on the next lesson when asked: the routine's newest not opened, from what the phone kept, else a set added and not opened", async () => {
    const store = createReadAloudStore(memoryStorage())
    const held = createHeldAnswers(memoryStorage())
    held.keep("home", "2026-10-14T05:00:00.000Z", {
      files: [
        {
          folder: "scene",
          name: "scene-a.json",
          file: {
            schema: "some-ui.routine-scene/1",
            title: "약속",
            decks: [
              routineDeck("plans-2", "Plans"),
              routineDeck("plans-2-lens", "Plans, lens"),
            ],
          },
        },
      ],
    })
    const opened = createOpenedStore(memoryStorage())
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      routineOpened: opened,
      initialOpen: "next",
      // Away from home: the look brings nothing, and the kept answer opens.
      routineFeed: createRoutineFeed(
        { key: "home", list: () => Promise.resolve({ files: [] }) },
        createRunLog(memoryStorage()),
        held
      ),
    })
    expect(await screen.findByRole("button", { name: "Pause" })).toBeTruthy()
    expect([...opened.opened()]).toEqual(["scene/scene-a.json"])
    expect(
      store.sets().find((set) => set.deck.id === "plans-2")?.openedAt
    ).not.toBeNull()
    cleanup()

    // Nothing new from the routine: the set added and not opened.
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
      routineOpened: opened,
      initialOpen: "next",
      routineFeed: createRoutineFeed(
        { key: "home", list: () => Promise.resolve({ files: [] }) },
        createRunLog(memoryStorage()),
        held
      ),
    })
    expect(await screen.findByRole("button", { name: "Pause" })).toBeTruthy()
    expect(store.sets().every((set) => set.openedAt !== null)).toBe(true)
    cleanup()

    // Nothing on the phone yet: it waits for home's first answer, then opens.
    let answer: (value: unknown) => void = () => {}
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
      initialOpen: "next",
      routineFeed: createRoutineFeed(
        {
          key: "home",
          list: () =>
            new Promise((resolve) => {
              answer = resolve
            }),
        },
        createRunLog(memoryStorage()),
        createHeldAnswers(memoryStorage())
      ),
    })
    await screen.findByText("No dramas this week yet.")
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull()
    act(() =>
      answer({
        files: [
          {
            folder: "scene",
            name: "scene-b.json",
            file: {
              schema: "some-ui.routine-scene/1",
              title: "약속",
              decks: [
                routineDeck("plans-3", "Plans"),
                routineDeck("plans-3-lens", "Plans, lens"),
              ],
            },
          },
        ],
        runs: [],
        at: "2026-10-14T05:00:00.000Z",
      })
    )
    expect(await screen.findByRole("button", { name: "Pause" })).toBeTruthy()
  })

  it("says what a set is for and where it takes place, and opens a lens set on the lens", async () => {
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
    })
    await pickFile(NEW_WORDS, () =>
      Promise.resolve(
        JSON.stringify({ schemaVersion: 1, ...LEVEL_ONE_LENS_SET })
      )
    )
    const ready = await screen.findByRole("button", { name: /^27 lines New/ })
    expect(ready.textContent).toContain(
      "TOPIK 1 · Grammar lens · 일상 · Level one"
    )
    expect(ready.textContent).toContain(LEVEL_ONE_LENS_SET.context?.premise)

    fireEvent.click(ready)
    expect(document.querySelector('[data-slot="lens-card"]')).not.toBeNull()
  })

  it("keeps the paces of words no set names yet, and lets go only what a set picked again drops", async () => {
    const store = createReadAloudStore(memoryStorage())
    // One starter word, and one level-one word the starter set does not name.
    const starterWord = STARTER_SET.words[0]?.id ?? ""
    const levelOneWord =
      LEVEL_ONE_SET.words.find(
        ({ id }) => !STARTER_SET.words.some((word) => word.id === id)
      )?.id ?? ""
    store.savePace(starterWord, { factor: 1, seen: 3 })
    store.savePace(levelOneWord, { factor: 1, seen: 3 })
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: store,
    })
    const pick = (deck: object): Promise<void> =>
      pickFile(NEW_WORDS, () =>
        Promise.resolve(JSON.stringify({ schemaVersion: 1, ...deck }))
      )

    // The starter set alone, read and left: the level-one word keeps its
    // pace until its own set comes back.
    await pick(STARTER_SET)
    await screen.findByText(/^Added /)
    fireEvent.click(await screen.findByRole("button", { name: /^Read aloud/ }))
    click("Back")
    expect(Object.keys(store.paces()).sort()).toEqual(
      [starterWord, levelOneWord].sort()
    )

    // The starter set picked again without its first word: that pace goes.
    await pick({
      ...STARTER_SET,
      words: STARTER_SET.words.filter(({ id }) => id !== starterWord),
      lines: STARTER_SET.lines.filter((line) =>
        line.words.every(({ wordId }) => wordId !== starterWord)
      ),
    })
    await vi.waitFor(() =>
      expect(Object.keys(store.paces())).toEqual([levelOneWord])
    )
  })

  it("offers only the levels the list holds, shows one alone, and holds it", async () => {
    const scene = (n: number, level: number): RoutineFile => ({
      kind: "scene",
      name: `scene-${n}.json`,
      title: `TOPIK ${level} · comedy · Scene ${n}`,
      decks: [
        routineDeck(`set-${n}`, `Set ${n}`),
        routineDeck(`set-${n}-lens`, `Set ${n}, lens`),
      ],
    })
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
      // The last drama was at TOPIK 4, and nothing listed is.
      lastDrama: holding(),
      routineFeed: {
        list: () =>
          Promise.resolve([scene(1, 2), scene(2, 1), scene(3, 2), scene(4, 2)]),
      },
    })
    const waiting = await screen.findByRole("region", {
      name: "From the routine",
    })
    const levels = screen.getByRole("radiogroup", { name: "Show level" })
    expect(
      within(levels)
        .getAllByRole("radio")
        .map((radio) => radio.textContent)
    ).toEqual(["All", "TOPIK 11", "TOPIK 23"])
    expect(within(waiting).getAllByRole("listitem")).toHaveLength(3)

    // A query held while a level of fewer than the first few is picked keeps
    // its field, so it can be cleared.
    fireEvent.change(within(waiting).getByRole("searchbox"), {
      target: { value: "Scene 3" },
    })
    fireEvent.click(within(levels).getByRole("radio", { name: "TOPIK 1" }))
    const routine = screen.getByRole("region", { name: "From the routine" })
    expect(within(routine).queryAllByRole("listitem")).toHaveLength(0)
    fireEvent.change(within(routine).getByRole("searchbox"), {
      target: { value: "" },
    })
    expect(
      within(screen.getByRole("region", { name: "From the routine" }))
        .getAllByRole("listitem")
        .map((card) => card.textContent)
    ).toEqual([expect.stringContaining("Scene 2")])
    // The prompt is asked at the level picked.
    await writeYourOwn()
    openLevelAndGenre()
    expect(
      screen
        .getByRole("radio", { name: "TOPIK 1" })
        .getAttribute("aria-checked")
    ).toBe("true")
  })

  it("offers no level to pick where everything listed is at one", async () => {
    renderLesson({ lastDrama: holding() })
    await writeYourOwnButton()
    expect(screen.queryByRole("radiogroup", { name: "Show level" })).toBeNull()
    // The prompt is asked at the level of the last drama.
    await writeYourOwn()
    openLevelAndGenre()
    expect(
      screen
        .getByRole("radio", { name: "TOPIK 4" })
        .getAttribute("aria-checked")
    ).toBe("true")
  })

  describe("What are you hungry for? (core/portion)", () => {
    const heard = (): Speaker => voice(() => Promise.resolve({ kind: "heard" }))
    const dish = (): HTMLElement => {
      const card = document.querySelector<HTMLElement>(
        '[data-slot="portion-dish"]'
      )
      if (card === null) throw new Error("nothing served")
      return card
    }
    const starterLine = (n: number): string =>
      STARTER_SET.lines[n]?.korean ?? ""

    it("serves a bite, then the next one like it, and reads aloud that sentence alone", async () => {
      const store = createReadAloudStore(memoryStorage())
      store.saveSets([
        {
          deck: STARTER_SET,
          addedAt: "2026-10-01T00:00:00.000Z",
          openedAt: null,
        },
      ])
      const orders = createPortionOrderStore(memoryStorage())
      renderLesson({
        speaker: heard(),
        readAloudStore: store,
        portionOrder: orders,
      })
      fireEvent.click(
        await screen.findByRole("button", { name: /What are you hungry for\?/ })
      )
      // Something never shown is held, so it leans fresh.
      expect(
        screen
          .getByRole("radio", { name: /A bite/ })
          .getAttribute("aria-checked")
      ).toBe("true")
      expect(
        screen
          .getByRole("radio", { name: /New to me/ })
          .getAttribute("aria-checked")
      ).toBe("true")
      click("Serve it")
      expect(screen.getByText("Served · A bite · New to me")).toBeTruthy()
      expect(dish().textContent).toContain(starterLine(0))
      expect(dish().textContent).toContain("New · never shown")
      expect(orders.last()).toEqual({ portion: "bite", freshness: "new" })

      click("Another one like this")
      expect(dish().textContent).toContain(starterLine(1))
      click("Start")
      expect(await screen.findByRole("button", { name: "Pause" })).toBeTruthy()
      await waitFor(() => expect(Object.keys(store.tally())).toHaveLength(1))
      expect(Object.keys(store.tally())[0]).toMatch(
        new RegExp(`^${STARTER_SET.id}\\.${STARTER_SET.lines[1]?.id ?? ""}:`)
      )
      // A bite isn't opening the set: it still waits under "Ready for you".
      expect(store.sets()[0]?.openedAt).toBeNull()
    })

    it("opens on the menu when asked, on the order kept, and says when nothing fits", async () => {
      const orders = createPortionOrderStore(memoryStorage())
      orders.save({ portion: "dessert", freshness: "seen" })
      renderLesson({
        speaker: heard(),
        portionOrder: orders,
        initialOpen: "menu",
      })
      expect(
        (await screen.findByRole("radio", { name: /Dessert/ })).getAttribute(
          "aria-checked"
        )
      ).toBe("true")
      click("Serve it")
      expect(
        screen.getByText(
          /Nothing on this phone makes dessert that is seen before/
        )
      ).toBeTruthy()
      click("Change my order")
      click("Back to materials")
      expect(await writeYourOwnButton()).toBeTruthy()
    })

    it("serves the routine's drama not opened yet as dessert, and plays it", async () => {
      const opened = createOpenedStore(memoryStorage())
      renderLesson({
        speaker: heard(),
        routineOpened: opened,
        routineFeed: {
          list: () =>
            Promise.resolve([
              {
                kind: "drama",
                name: "drama-20261013T145200123Z.json",
                tree: workedLesson(),
              },
            ] satisfies ReadonlyArray<RoutineFile>),
        },
      })
      await screen.findByRole("region", { name: "From the routine" })
      click(/What are you hungry for\?/)
      fireEvent.click(screen.getByRole("radio", { name: /Dessert/ }))
      click("Serve it")
      expect(dish().textContent).toContain("New · from the routine")
      expect(dish().textContent).toContain("Nothing is marked.")
      click("Start")
      expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
      expect([...opened.opened()]).toEqual([
        "drama/drama-20261013T145200123Z.json",
      ])
    })
  })

  describe("the operator's served dramas (MKJ-S4)", () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    const TEA = {
      key: "first-tea",
      displayName: "Tea at the chairman's",
      description: "Seo-yeon's first visit to the chairman's house",
      batchCount: 1,
      totalQuestions: 3,
      totalMessages: 12,
      tags: ["topik-2", "genre:family", "genre:office-romance"],
    }
    const feedOf = (load: TreeFeed["load"]): TreeFeed => ({
      list: () => Promise.resolve([TEA]),
      load,
    })

    it("lists the served trees, and plays one through both audits", async () => {
      const load = vi.fn<TreeFeed["load"]>(() =>
        Promise.resolve({
          status: "checked",
          lesson: workedLesson(),
          findings: [],
        })
      )
      const points = createServedPointStore(memoryStorage())
      const place = vi.spyOn(points, "get")
      renderLesson({ treeFeed: feedOf(load), servedPoints: points })
      const dramas = await screen.findByRole("region", { name: "Dramas" })
      expect(dramas.textContent).toMatch(/TOPIK 2/)
      expect(dramas.textContent).not.toMatch(EXERCISE_FRAMING)
      expect(load).not.toHaveBeenCalled()

      fireEvent.click(
        within(dramas).getByRole("button", {
          name: "Play it: Tea at the chairman's",
        })
      )
      expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
      expect(load).toHaveBeenCalledWith("first-tea")
      expect(screen.getByRole("heading", { name: "첫 차" })).toBeTruthy()
      // Its place is this device's, under its listing's key and its id.
      expect(place).toHaveBeenCalledWith("first-tea/first-tea")

      click("Back to materials")
      expect(await screen.findByRole("region", { name: "Dramas" })).toBeTruthy()
      // A served tree never takes the pasted slot.
      expect(
        screen.queryByRole("region", { name: "Pasted this session" })
      ).toBeNull()
    })

    it("does not play a served tree the audits reject, and goes back", async () => {
      renderLesson({
        treeFeed: feedOf(() =>
          Promise.resolve({ status: "rejected", findings: [] })
        ),
      })
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Play it: Tea at the chairman's",
        })
      )
      expect(
        await screen.findByText("This drama can't be played.")
      ).toBeTruthy()
      expect(screen.queryByText("숨 막히는 긴장감")).toBeNull()
      // The screen's own way back, below the header's.
      fireEvent.click(
        screen.getAllByRole("button", { name: "Back to materials" }).at(-1)!
      )
      expect(await screen.findByRole("region", { name: "Dramas" })).toBeTruthy()
    })

    it("seeds the learner's own drama from a card: its premise and genres (MKJ-S9)", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
      renderLesson({ treeFeed: feedOf(vi.fn()) })
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Make my own from Tea at the chairman's",
        })
      )
      expect(screen.getByRole("textbox", { name: "Scene" })).toHaveProperty(
        "value",
        "Seo-yeon's first visit to the chairman's house"
      )
      openLevelAndGenre()
      const genre = within(screen.getByRole("group", { name: "Genre" }))
      expect(
        genre.getByRole("button", { name: /가족/ }).getAttribute("aria-pressed")
      ).toBe("true")
      // A card's own genre stays offered once taken back.
      const office = genre.getByRole("button", { name: "office romance" })
      fireEvent.click(office)
      fireEvent.click(genre.getByRole("button", { name: "office romance" }))
      expect(office.isConnected).toBe(true)
      // A pick of one's own, beside the card's.
      fireEvent.click(genre.getByRole("button", { name: /복수/ }))
      click(/Copy the prompt/)
      await screen.findByText(/Copied/)
      expect(String(writeText.mock.calls[0]?.[0])).toContain(
        "Genre: family, office romance, revenge"
      )
    })

    it("lists no lesson as a drama, from a server that ignores the trees' activity", async () => {
      const lessonsAsTrees: TreeFeed = {
        list: () =>
          fixtureMetadataRepository.loadCatalog().then(({ topiks }) => topiks),
        load: vi.fn(),
      }
      renderLesson({ treeFeed: lessonsAsTrees })
      expect(await screen.findByText("No dramas this week yet.")).toBeTruthy()
      expect(screen.queryByRole("region", { name: "Dramas" })).toBeNull()
      expect(screen.queryByText("Ordering at a café")).toBeNull()
    })

    it("lists the served trees when the lessons' manifest fails to load", async () => {
      renderLesson({
        metadataRepository: {
          ...fixtureMetadataRepository,
          loadCatalog: () => Promise.reject(new Error("500")),
        },
        treeFeed: feedOf(vi.fn()),
      })
      expect(await screen.findByText("Tea at the chairman's")).toBeTruthy()
    })

    it("says the dramas failed to load, and loads them again on request", async () => {
      const list = vi
        .fn<TreeFeed["list"]>()
        .mockRejectedValueOnce(new Error("500"))
        .mockResolvedValue([TEA])
      renderLesson({ treeFeed: { list, load: vi.fn() } })
      expect(await screen.findByText("Couldn't load the dramas.")).toBeTruthy()
      click("Try again")
      expect(await screen.findByText("Tea at the chairman's")).toBeTruthy()
      expect(screen.queryByText(/Couldn't load the dramas/)).toBeNull()
    })

    it("says none are served where the host serves none, and offers to write one", async () => {
      renderLesson()
      expect(await screen.findByText("No dramas this week yet.")).toBeTruthy()
      expect(screen.queryByRole("region", { name: "Dramas" })).toBeNull()
      expect(
        screen.getByRole("button", { name: /Write your own drama/ })
      ).toBeTruthy()
    })
  })

  describe("the learner's own drama (canon Cor. 8.2, Rem. 7.4)", () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("plays a pasted scene tree as the drama, and holds it for the session only", async () => {
      const pasted = createPastedLessonStore(memoryStorage())
      renderLesson({ pastedStore: pasted })
      await writeYourOwn()
      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: workedExample() } }
      )
      click("Read the reply")
      click(/^Start$/)

      expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
      expect(pasted.getTree()?.id).toBe("first-tea")

      click("Back to materials")
      const held = await screen.findByRole("region", {
        name: "Pasted this session",
      })
      expect(held.textContent).toMatch(/Drama · TOPIK 2/)
      expect(held.textContent).toMatch(/until this tab closes/)
      fireEvent.click(within(held).getByText("첫 차"))
      expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
      click("Back to materials")
      click("Forget this drama")
      expect(
        screen.queryByRole("region", { name: "Pasted this session" })
      ).toBeNull()
      expect(pasted.getTree()).toBeNull()
    })

    it("shares the next scene's prompt at an ending, carrying the drama just played (MKJ-S8)", async () => {
      const pasted = createPastedLessonStore(memoryStorage())
      pasted.setTree(workedLesson())
      const last = createLastDramaStore(memoryStorage())
      const share = vi.fn<FileShare>(() =>
        Promise.resolve({ status: "succeeded", value: "shared" })
      )
      renderLesson({ pastedStore: pasted, lastDrama: last, share })
      fireEvent.click(await screen.findByText("첫 차"))
      click(/Next/)
      click(/Next/)
      click(/네, 감사합니다/)
      click(/Next/)
      click(/Next/)
      click(/Next/)
      click(/어땠어요/)
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "more revenge" },
      })
      click(/다음 화 쓰기/)
      expect(document.body.textContent).not.toMatch(EXERCISE_FRAMING)

      const file = share.mock.calls[0]?.[0]
      expect(file?.text).toContain('Last drama:\n"첫 차", level 2.')
      expect(file?.text).toContain('what next: "more revenge"')
      // Shared is handed off: the free text it carried goes (Rem. 7.4), from
      // the store and from the field on screen.
      await vi.waitFor(() => expect(last.get()?.review).toBeUndefined())
      expect(screen.getByRole("textbox")).toHaveProperty("value", "")
    })

    it("asks home for the next scene at an ending, carrying the drama just played (HF4)", async () => {
      const pasted = createPastedLessonStore(memoryStorage())
      pasted.setTree(workedLesson())
      const last = createLastDramaStore(memoryStorage())
      const share = vi.fn<FileShare>()
      const ask = vi.fn<SceneAsk["ask"]>(() => true)
      const kept = { said: "Kept on this phone.", held: false }
      const sceneAsk: SceneAsk = {
        getSnapshot: () => kept,
        subscribe: () => () => undefined,
        ask,
      }
      renderLesson({ pastedStore: pasted, lastDrama: last, share, sceneAsk })
      fireEvent.click(await screen.findByText("첫 차"))
      click(/Next/)
      click(/Next/)
      click(/네, 감사합니다/)
      click(/Next/)
      click(/Next/)
      click(/Next/)
      click(/어땠어요/)
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "more revenge" },
      })
      click(/다음 화 쓰기/)

      const asked = ask.mock.calls[0]?.[0]
      expect(asked?.stamp).toMatch(/^drama-\d{8}T\d{9}Z$/)
      expect(asked?.text).toContain('Last drama:\n"첫 차", level 2.')
      expect(asked?.text).toContain('what next: "more revenge"')
      expect(share).not.toHaveBeenCalled()
      expect(screen.getByText("Kept on this phone.")).toBeTruthy()
      // Kept on the phone is handed off: the free text now travels in the
      // ask (Rem. 7.4).
      await vi.waitFor(() => expect(last.get()?.review).toBeUndefined())
    })

    it("opens a scene from storage: a tree plays, and anything else is judged like a paste (MKJ-S10)", async () => {
      renderLesson()
      const pick = (text: () => Promise<string>): Promise<void> =>
        pickFile(/Open a scene from storage/, text)
      await pick(() => Promise.resolve(workedExample()))
      expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()

      click("Back to materials")
      await pick(() => Promise.reject(new Error("provider gone")))
      expect(
        await screen.findByText("Couldn't open that file. Try again.")
      ).toBeTruthy()

      await pick(() => Promise.resolve("not a drama"))
      const reply = await screen.findByRole("textbox", {
        name: "Your model's reply",
      })
      expect(reply).toHaveProperty("value", "not a drama")
      expect(screen.getByRole("alert")).toBeTruthy()
    })

    it("names where scene files wait on the picker, when the host says", async () => {
      renderLesson({ sceneFileHint: "In Drive, look in Dramas › requests" })
      expect(
        await screen.findByLabelText(/Open a scene from storage/)
      ).toHaveAccessibleDescription(/In Drive, look in Dramas › requests/)
    })

    it("offers the drama's sound in the header, off until turned on", async () => {
      const pasted = createPastedLessonStore(memoryStorage())
      pasted.setTree(workedLesson())
      const control = createSoundControl(memoryStorage())
      const tones = fakeTones()
      renderLesson({
        pastedStore: pasted,
        soundControl: control,
        tones: tones.factory,
      })
      const held = await screen.findByText("첫 차")
      expect(screen.queryByRole("button", { name: "효과음" })).toBeNull()
      fireEvent.click(held)
      const toggle = await screen.findByRole("button", { name: "효과음" })
      expect(toggle.getAttribute("aria-pressed")).toBe("false")
      fireEvent.click(toggle)
      expect(control.state()).toBe("on")
      expect(toggle.getAttribute("aria-pressed")).toBe("true")
      // Turning it on plays the opening scene's tone, inside that tap.
      expect(tones.made()).toBe(1)
      act(() => control.withdraw())
      expect(screen.queryByRole("button", { name: "효과음" })).toBeNull()
    })

    it("has no sound toggle where nothing can play a tone", async () => {
      const pasted = createPastedLessonStore(memoryStorage())
      pasted.setTree(workedLesson())
      renderLesson({ pastedStore: pasted, tones: null })
      fireEvent.click(await screen.findByText("첫 차"))
      expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
      expect(screen.queryByRole("button", { name: "효과음" })).toBeNull()
    })

    it("hands out the tree prompt with the last drama, and forgets its free text once carried", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
      const last = holding({
        review: { enjoyed: "not-for-me", next: "reading webtoons raw" },
      })
      renderLesson({ lastDrama: last })

      await writeYourOwn()
      openLevelAndGenre()
      fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
      click(/Copy the prompt/)
      await screen.findByText(/Copied/)
      const prompt = String(writeText.mock.calls[0]?.[0])
      expect(prompt).toContain("Level: 2")
      expect(prompt).toContain('Last drama:\n"회장님 댁 거실", level 4.')
      expect(prompt).toContain('what next: "reading webtoons raw"')
      // ...and the free text is not kept once carried (canon Rem. 7.4).
      expect(last.get()?.review).toEqual({ enjoyed: "not-for-me" })
    })

    it("keeps the free text until the prompt actually reaches the learner", async () => {
      vi.stubGlobal("navigator", {
        ...navigator,
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error("denied")),
        },
      })
      const last = holding({ review: { next: "reading webtoons raw" } })
      renderLesson({ lastDrama: last })
      await writeYourOwn()
      click(/Copy the prompt/)
      const manual = await screen.findByRole("textbox", {
        name: "Prompt to copy",
      })
      expect(manual.textContent).toContain("reading webtoons raw")
      // Copying proves nothing on its own; the learner's confirmation does.
      fireEvent.copy(manual)
      expect(last.get()?.review?.next).toBe("reading webtoons raw")
      click(/I've copied it/)
      expect(last.get()?.review).toBeUndefined()
    })

    it("deletes what retired stores left in localStorage", async () => {
      for (const key of RETIRED_KEYS) window.localStorage.setItem(key, "[]")
      renderLesson()
      await writeYourOwnButton()
      for (const key of RETIRED_KEYS) {
        expect(window.localStorage.getItem(key)).toBeNull()
      }
    })
  })
})
