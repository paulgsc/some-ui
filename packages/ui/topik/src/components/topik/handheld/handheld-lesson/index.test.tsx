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
  within,
} from "@testing-library/react"
import { EXERCISE_FRAMING } from "@topik/components/topik/handheld/drama-lesson/exercise-framing"
import type { ITopikMetadataRepository } from "@topik/lib/topik"
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"
import type { LastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import { createLastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import type { FileShare } from "@topik/lib/topik/adapter/next-scene-share"
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  createPastedLessonStore,
  RETIRED_KEYS,
} from "@topik/lib/topik/adapter/pasted-lesson"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
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
import { afterEach, describe, expect, it, vi } from "vitest"

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
}: RenderOptions = {}): void {
  const tree = (): JSX.Element => (
    <QueryClientProvider client={client}>
      <SessionConfigProvider
        value={{
          topikRepository: fixtureTopikRepository,
          metadataRepository,
          speaker,
          ...(treeFeed ? { treeFeed } : {}),
          ...(share ? { share } : {}),
        }}
      >
        <HandheldLesson
          lastDrama={lastDrama}
          pastedStore={pastedStore}
          readAloudStore={readAloudStore}
          soundControl={soundControl}
          tones={tones}
          servedPoints={servedPoints}
        />
      </SessionConfigProvider>
    </QueryClientProvider>
  )
  render(tree())
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

const writeYourOwnButton = (): Promise<HTMLElement> =>
  screen.findByRole("button", { name: /Write your own drama/ })

const writeYourOwn = async (): Promise<void> => {
  fireEvent.click(await writeYourOwnButton())
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

  it("opens the read-aloud drill from the material list, and comes back", async () => {
    renderLesson({
      speaker: voice(() => Promise.resolve({ kind: "heard" })),
      readAloudStore: createReadAloudStore(memoryStorage()),
    })
    fireEvent.click(await screen.findByRole("button", { name: /Read aloud/ }))
    expect(screen.getByRole("button", { name: /Start/ })).toBeTruthy()
    expect(screen.getByLabelText("Your reading aloud")).toBeTruthy()
    click("Back")
    expect(await writeYourOwnButton()).toBeTruthy()
  })

  it("holds the level of the last drama until the learner chooses another", async () => {
    renderLesson({ lastDrama: holding() })
    const level = (value: number): string | null =>
      screen
        .getByRole("radio", { name: `TOPIK ${value}` })
        .getAttribute("aria-checked")
    await writeYourOwnButton()
    expect(level(4)).toBe("true")
    fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
    expect(level(2)).toBe("true")
    // The prompt is asked at the level held.
    await writeYourOwn()
    expect(
      screen
        .getByRole("radio", { name: "TOPIK 2" })
        .getAttribute("aria-checked")
    ).toBe("true")
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
      expect(
        screen.getByRole("heading", { name: workedLesson().root.place })
      ).toBeTruthy()
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
      fireEvent.click(within(held).getByText("회장님 댁 거실"))
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
      fireEvent.click(await screen.findByText("회장님 댁 거실"))
      click(/Next/)
      click(/Next/)
      click(/네, 감사합니다/)
      click(/Next/)
      click(/Next/)
      click(/어땠어요/)
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "more revenge" },
      })
      click(/Share the next scene's prompt/)
      expect(document.body.textContent).not.toMatch(EXERCISE_FRAMING)

      const file = share.mock.calls[0]?.[0]
      expect(file?.text).toContain('Last drama:\n"회장님 댁 거실", level 2.')
      expect(file?.text).toContain('what next: "more revenge"')
      // Shared is handed off: the free text it carried goes (Rem. 7.4), from
      // the store and from the field on screen.
      await vi.waitFor(() => expect(last.get()?.review).toBeUndefined())
      expect(screen.getByRole("textbox")).toHaveProperty("value", "")
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
      const held = await screen.findByText("회장님 댁 거실")
      expect(screen.queryByRole("button", { name: "Scene sound" })).toBeNull()
      fireEvent.click(held)
      const toggle = await screen.findByRole("button", { name: "Scene sound" })
      expect(toggle.getAttribute("aria-pressed")).toBe("false")
      fireEvent.click(toggle)
      expect(control.state()).toBe("on")
      expect(toggle.getAttribute("aria-pressed")).toBe("true")
      // Turning it on plays the opening scene's tone, inside that tap.
      expect(tones.made()).toBe(1)
      act(() => control.withdraw())
      expect(screen.queryByRole("button", { name: "Scene sound" })).toBeNull()
    })

    it("has no sound toggle where nothing can play a tone", async () => {
      const pasted = createPastedLessonStore(memoryStorage())
      pasted.setTree(workedLesson())
      renderLesson({ pastedStore: pasted, tones: null })
      fireEvent.click(await screen.findByText("회장님 댁 거실"))
      expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
      expect(screen.queryByRole("button", { name: "Scene sound" })).toBeNull()
    })

    it("hands out the tree prompt with the last drama, and forgets its free text once carried", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
      const last = holding({
        review: { enjoyed: "not-for-me", next: "reading webtoons raw" },
      })
      renderLesson({ lastDrama: last })

      await writeYourOwn()
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
