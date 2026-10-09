import type { JSX } from "react"
import type { Speaker, SpeechOutcome } from "@some-ui/speech"
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
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"
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
import type { StorageLike } from "@topik/lib/topik/adapter/storage"
import type { SurveyStore } from "@topik/lib/topik/adapter/survey-store"
import {
  createSurveyStore,
  SURVEY_STORAGE_KEY,
} from "@topik/lib/topik/adapter/survey-store"
import { reportsDocument } from "@topik/lib/topik/adapter/survey-store/held-reports"
import type { TreeFeed } from "@topik/lib/topik/adapter/tree-feed"
import { createServedPointStore } from "@topik/lib/topik/adapter/tree-feed"
import type { SurveyReport } from "@topik/lib/topik/core/lesson-survey"
import {
  workedExample,
  workedLesson,
} from "@topik/lib/topik/generation/tree-intake/worked-example"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HandheldLesson } from "."
import { fixtureMetadataRepository, fixtureTopikRepository } from "./fixture"

type RenderOptions = {
  surveyStore?: SurveyStore
  pastedStore?: PastedLessonStore
  client?: QueryClient
  // No voice by default: the ladder starts at Hangul (canon Def. 9.3).
  speaker?: Speaker | null
  readAloudStore?: ReadAloudStore
  soundControl?: SoundControl
  tones?: ToneContextFactory | null
  treeFeed?: TreeFeed
  servedPoints?: ReturnType<typeof createServedPointStore>
}

function renderLesson({
  surveyStore = createSurveyStore(memoryStorage()),
  pastedStore = createPastedLessonStore(memoryStorage()),
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  speaker = null,
  readAloudStore,
  soundControl,
  tones,
  treeFeed,
  servedPoints = createServedPointStore(memoryStorage()),
}: RenderOptions = {}): void {
  const tree = (): JSX.Element => (
    <QueryClientProvider client={client}>
      <SessionConfigProvider
        value={{
          topikRepository: fixtureTopikRepository,
          metadataRepository: fixtureMetadataRepository,
          speaker,
          ...(treeFeed ? { treeFeed } : {}),
        }}
      >
        <HandheldLesson
          surveyStore={surveyStore}
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

/** Puts `reports`, newest first, in the survey store's storage. */
const holdReports = (
  storage: StorageLike,
  reports: Array<SurveyReport>
): void => storage.setItem(SURVEY_STORAGE_KEY, reportsDocument(reports))

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

  it("holds the level of the last report until the learner chooses another", async () => {
    const storage = memoryStorage()
    holdReports(storage, [
      { topikKey: "local:earlier", at: 1, stuck: [], level: 4 },
    ])
    renderLesson({ surveyStore: createSurveyStore(storage, () => 2) })
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
    const TEA = {
      key: "first-tea",
      displayName: "Tea at the chairman's",
      description: "",
      batchCount: 1,
      totalQuestions: 3,
      totalMessages: 12,
      tags: ["topik-2"],
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
      expect(dramas.textContent).toMatch(/Drama · TOPIK 2/)
      expect(load).not.toHaveBeenCalled()

      fireEvent.click(within(dramas).getByText("Tea at the chairman's"))
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
      fireEvent.click(await screen.findByText("Tea at the chairman's"))
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

    it("hands out the tree prompt with what is left of the reports, and forgets their free text once carried", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
      const storage = memoryStorage()
      holdReports(storage, [
        {
          topikKey: "local:earlier",
          displayName: "An earlier lesson",
          at: 1,
          worthwhile: "no",
          stuck: [],
          becoming: "reading webtoons raw",
        },
      ])
      const surveys = createSurveyStore(storage, () => 2)
      renderLesson({ surveyStore: surveys })

      await writeYourOwn()
      fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
      click(/Copy the prompt/)
      await screen.findByText(/Copied/)
      const prompt = String(writeText.mock.calls[0]?.[0])
      expect(prompt).toContain("Level: 2")
      expect(prompt).toContain("1. An earlier lesson: not worthwhile.")
      expect(prompt).toContain('Making them into: "reading webtoons raw"')
      // ...and the free text is not kept once carried (canon Rem. 7.4).
      expect(surveys.list()[0]?.becoming).toBeUndefined()
    })

    it("keeps the survey's free text until the prompt actually reaches the learner", async () => {
      vi.stubGlobal("navigator", {
        ...navigator,
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error("denied")),
        },
      })
      const storage = memoryStorage()
      holdReports(storage, [
        {
          topikKey: "local:earlier",
          displayName: "An earlier lesson",
          at: 1,
          stuck: [],
          becoming: "reading webtoons raw",
        },
      ])
      const surveys = createSurveyStore(storage, () => 2)
      renderLesson({ surveyStore: surveys })
      await writeYourOwn()
      click(/Copy the prompt/)
      const manual = await screen.findByRole("textbox", {
        name: "Prompt to copy",
      })
      expect(manual.textContent).toContain("reading webtoons raw")
      expect(surveys.list()[0]?.becoming).toBe("reading webtoons raw")

      // Another tab's build adds a report while the fallback is open; this
      // prompt never carried it.
      holdReports(storage, [
        {
          topikKey: "local:later",
          displayName: "A later lesson",
          at: 2,
          stuck: [],
          becoming: "ordering without pointing",
        },
        ...surveys.list(),
      ])
      // A second prompt, carrying it, is built while the clipboard hangs;
      // the fallback on screen is still the first prompt.
      vi.stubGlobal("navigator", {
        ...navigator,
        clipboard: {
          writeText: () => new Promise<SpeechOutcome>(() => undefined),
        },
      })
      click(/Copy the prompt/)
      expect(manual.textContent).not.toContain("ordering without pointing")
      // Copying proves nothing on its own; the learner's confirmation does.
      fireEvent.copy(manual)
      expect(surveys.list()[1]?.becoming).toBe("reading webtoons raw")
      click(/I've copied it/)
      const [later, earlier] = surveys.list()
      expect(later?.becoming).toBe("ordering without pointing")
      expect(earlier?.becoming).toBeUndefined()
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
