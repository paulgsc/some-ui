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
import type {
  ITopikMetadataRepository,
  ITopikRepository,
} from "@topik/lib/topik"
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"
import type { PastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import {
  createPastedLessonStore,
  RETIRED_LESSONS_KEY,
} from "@topik/lib/topik/adapter/pasted-lesson"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import { createReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { createResumeStore } from "@topik/lib/topik/adapter/resume-point"
import type {
  SoundControl,
  ToneContextFactory,
} from "@topik/lib/topik/adapter/sound-port"
import { createSoundControl } from "@topik/lib/topik/adapter/sound-port"
import { fakeTones } from "@topik/lib/topik/adapter/sound-port/fake-tones"
import type { SurveyStore } from "@topik/lib/topik/adapter/survey-store"
import {
  createSurveyStore,
  SURVEY_TTL_MS,
} from "@topik/lib/topik/adapter/survey-store"
import type { TreeFeed } from "@topik/lib/topik/adapter/tree-feed"
import { createServedPointStore } from "@topik/lib/topik/adapter/tree-feed"
import { pinMisses } from "@topik/lib/topik/core/lesson-survey"
import {
  workedExample,
  workedLesson,
} from "@topik/lib/topik/generation/tree-intake/worked-example"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HandheldLesson } from "."
import {
  FIXTURE_BATCHES,
  FIXTURE_TOPIK_KEY,
  fixtureMetadataRepository,
  fixtureTopikRepository,
} from "./fixture"

type ResumeStore = ReturnType<typeof createResumeStore>

type RenderOptions = {
  storage?: StorageLike
  topikRepository?: ITopikRepository
  surveyStore?: SurveyStore
  pastedStore?: PastedLessonStore
  pastedResumeStore?: ResumeStore
  metadataRepository?: ITopikMetadataRepository
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
  storage = memoryStorage(),
  topikRepository = fixtureTopikRepository,
  surveyStore = createSurveyStore(memoryStorage()),
  pastedStore = createPastedLessonStore(memoryStorage()),
  pastedResumeStore = createResumeStore(memoryStorage()),
  metadataRepository = fixtureMetadataRepository,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  speaker = null,
  readAloudStore,
  soundControl,
  tones,
  treeFeed,
  servedPoints = createServedPointStore(memoryStorage()),
}: RenderOptions = {}): ResumeStore {
  const store = createResumeStore(storage)
  const tree = (): JSX.Element => (
    <QueryClientProvider client={client}>
      <SessionConfigProvider
        value={{
          topikRepository,
          metadataRepository,
          speaker,
          ...(treeFeed ? { treeFeed } : {}),
        }}
      >
        <HandheldLesson
          resumeStore={store}
          surveyStore={surveyStore}
          pastedStore={pastedStore}
          pastedResumeStore={pastedResumeStore}
          readAloudStore={readAloudStore}
          soundControl={soundControl}
          tones={tones}
          servedPoints={servedPoints}
        />
      </SessionConfigProvider>
    </QueryClientProvider>
  )
  render(tree())
  return store
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

const CAFE_LINE = "어서 오세요. 뭐 드릴까요?"
const CARD_LINE = "카드로 할게요. 감사합니다."
/** A resume point on conversation 2's c2-m2, which anchors two probes. */
const AT_C2_M2 = { batchId: 2, conversation: 1, messageId: "c2-m2" }

const resumeAt = (
  storage: StorageLike,
  point: Parameters<ResumeStore["set"]>[1] = AT_C2_M2
): void => createResumeStore(storage).set(FIXTURE_TOPIK_KEY, point)

const click = (name: string | RegExp): void => {
  fireEvent.click(screen.getByRole("button", { name }))
}

const pick = (name: RegExp): void => {
  fireEvent.click(screen.getByRole("radio", { name }))
}

const buildFromTiles = (pieces: Array<string>): void => {
  const pool = document.querySelector("[data-slot='topik-tile-pool']")!
  for (const piece of pieces) {
    const tile = [...pool.querySelectorAll("button")].find(
      (b) => b.textContent === piece && !b.disabled
    )!
    fireEvent.click(tile)
  }
}

/** Pick an answer, check it, and move on. */
const answer = (name: RegExp): void => {
  pick(name)
  click("Check")
  click(/Continue/)
}

/** Build from tiles, check it, and move on. */
const build = (pieces: Array<string>): void => {
  buildFromTiles(pieces)
  click("Check")
  click(/Continue/)
}

const openCafe = async (): Promise<void> => {
  fireEvent.click(
    await screen.findByRole("button", { name: /Ordering at a café/ })
  )
  await screen.findByText(CAFE_LINE)
}

const continueAtCard = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
  await screen.findByText(CARD_LINE)
}

afterEach(cleanup)

describe("HandheldLesson", () => {
  it("follows a line with a probe about it, never a first-order question (canon Cor. 4.5)", async () => {
    renderLesson()
    await openCafe()
    expect(screen.getByText(CAFE_LINE)).toBeTruthy()
    // The line anchors a probe, so its English waits for the answer.
    expect(screen.queryByRole("button", { name: /Show English/ })).toBeNull()

    click(/^Next/)
    expect(screen.getByText("Which reply fits?")).toBeTruthy()
    // The fixture's first-order question is the desktop's; it never appears here.
    expect(screen.queryByText("What did the customer order?")).toBeNull()
    expect(screen.getByRole("button", { name: "Check" })).toHaveProperty(
      "disabled",
      true
    )

    pick(/아이스 아메리카노 한 잔 주세요/)
    click("Check")
    expect(screen.getByText("Right")).toBeTruthy()
    // Every candidate comes back with its reason, not just the right one.
    expect(screen.getByText(/a customer never says it back/)).toBeTruthy()
    // And the line's English is now earned.
    expect(screen.getByText("Welcome. What can I get you?")).toBeTruthy()
  })

  it("does not offer read-aloud without a voice (canon Cor. 4.6)", async () => {
    renderLesson()
    await screen.findByRole("button", { name: /Ordering at a café/ })
    expect(screen.queryByRole("button", { name: /Read aloud/ })).toBeNull()
  })

  it("lets a replay interrupt what is playing, while a line the lesson reaches waits its turn", async () => {
    const urgencies: Array<string> = []
    renderLesson({
      speaker: voice((_text, options): Promise<SpeechOutcome> => {
        urgencies.push(options.urgency ?? "next")
        return Promise.resolve({ kind: "heard" })
      }),
      readAloudStore: createReadAloudStore(memoryStorage()),
    })
    fireEvent.click(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    )
    await screen.findByRole("button", { name: "Play line" })
    const reached = [...urgencies]

    click("Play line")

    expect(reached.every((urgency) => urgency === "next")).toBe(true)
    expect(urgencies.slice(reached.length)).toEqual(["now"])
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
    expect(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    ).toBeTruthy()
  })

  it("judges transformations, builds one from tiles, and revisits a miss once", async () => {
    renderLesson()
    await openCafe()

    click(/^Next/) // reply probe
    answer(/아이스 아메리카노 한 잔 주세요/)

    click(/^Next/) // line 2 -> odd one out
    expect(
      screen.getByText("Which is NOT a valid transformation of this request?")
    ).toBeTruthy()
    // Candidates carry their claimed relation; this one is valid, so a miss.
    pick(/Same meaning.*부탁해요/)
    click("Check")
    expect(screen.getByText(/comes back once more/)).toBeTruthy()
    click(/Continue/)

    click(/^Next/) // line 3 -> honorific
    answer(/It honours the customer/)

    click(/^Next/) // line 4 -> build the negation
    expect(screen.getByText("Turn this into a negative request.")).toBeTruthy()
    buildFromTiles(["포장하지", "마세요"])
    click("Check")
    expect(screen.getByText("Right")).toBeTruthy()
    click(/Continue/)

    // The missed odd-one-out, once more, before the wrap.
    expect(screen.getByText("Once more")).toBeTruthy()
    answer(/Negation.*안 주세요/)

    expect(
      screen.getByText("3 of 4 understood on the first listen")
    ).toBeTruthy()
    expect(screen.getByText("1 revisited after the conversation")).toBeTruthy()
  })

  it("keeps a miss pinned to the probe that was missed when the file refreshes", async () => {
    let batches = FIXTURE_BATCHES
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const store = renderLesson({
      topikRepository: { load: () => Promise.resolve(batches) },
      client,
    })
    await openCafe()
    click(/^Next/)
    answer(/아이스 아메리카노 한 잔 주세요/)
    click(/^Next/)
    answer(/Same meaning.*부탁해요/) // valid, so a miss

    // The lesson is revised under the same probe id, and the file refetched.
    const revised = structuredClone(FIXTURE_BATCHES)
    const probe = revised[0]?.probes?.find(
      (candidate) => candidate.id === "c1-request-forms"
    )
    if (!probe) throw new Error("fixture lost c1-request-forms")
    probe.prompt = "Which of these is wrong?"
    batches = revised
    // Query observers are notified on a later task, not within the refetch.
    await act(async () => {
      await client.invalidateQueries()
      await new Promise((resolve) =>
        setTimeout(() => resolve({ kind: "heard" }), 0)
      )
    })

    // A later miss in the same conversation is pinned to what it is now;
    // the earlier one keeps the pin it was missed under.
    click(/^Next/)
    answer(/past tense/)

    click("Back to materials")
    expect(store.get(FIXTURE_TOPIK_KEY)?.survey?.missed).toEqual({
      1: [
        ...(pinMisses(FIXTURE_BATCHES, { 1: ["c1-request-forms"] })[1] ?? []),
        ...(pinMisses(revised, { 1: ["c1-honorific"] })[1] ?? []),
      ],
    })
  })

  it.each([
    [
      "resumes at the line it was left on, by message id",
      fixtureTopikRepository,
      "Conversation 2 of 2",
    ],
    [
      "finds the saved conversation by its id when the file reorders them",
      // The file now lists conversation 2 first.
      {
        load: (): Promise<typeof FIXTURE_BATCHES> =>
          Promise.resolve([...FIXTURE_BATCHES].reverse()),
      },
      "Conversation 1 of 2",
    ],
  ])("%s", async (_, topikRepository, position) => {
    const storage = memoryStorage()
    resumeAt(storage)
    renderLesson({ storage, topikRepository })
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    expect(await screen.findByText(CARD_LINE)).toBeTruthy()
    expect(screen.getByText(position)).toBeTruthy()
  })

  it("keeps the gloss out of feedback while another probe on the line is pending", async () => {
    const storage = memoryStorage()
    resumeAt(storage)
    renderLesson({ storage })
    await continueAtCard()

    // c2-m2 anchors two probes: the odd-one-out, then the past-tense build.
    click(/^Next/)
    pick(/Question.*할게요\?/)
    click("Check")
    expect(screen.getByText("Right")).toBeTruthy()
    expect(screen.queryByText("I'll pay by card. Thank you.")).toBeNull()
    expect(
      screen.getByText(/English unlocks after the other question/)
    ).toBeTruthy()

    click(/Continue/)
    buildFromTiles(["카드로", "했어요"])
    click("Check")
    expect(screen.getByText("I'll pay by card. Thank you.")).toBeTruthy()
  })

  it("keeps answered probes and promised repeats across a reload", async () => {
    const storage = memoryStorage()
    renderLesson({ storage })
    await openCafe()
    click(/^Next/) // the reply probe
    pick(/네, 어서 오세요/)
    click("Check")
    expect(screen.getByText(/comes back once more/)).toBeTruthy()

    // The tab reloads before Continue.
    cleanup()
    renderLesson({ storage })
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))

    // Back at the probe's line; the answered probe is passed over.
    expect(await screen.findByText(CAFE_LINE)).toBeTruthy()
    click(/^Next/)
    expect(screen.getByText("아이스 아메리카노 한 잔 주세요.")).toBeTruthy()

    click(/^Next/)
    answer(/Negation.*안 주세요/)
    click(/^Next/)
    answer(/It honours the customer/)
    click(/^Next/)
    build(["포장하지", "마세요"])

    // The miss from before the reload still comes back.
    expect(screen.getByText("Once more")).toBeTruthy()
    answer(/아이스 아메리카노 한 잔 주세요/)
    expect(
      screen.getByText("3 of 4 understood on the first listen")
    ).toBeTruthy()
  })

  it("does not resume a point that cannot say which conversation it was", async () => {
    const storage = memoryStorage()
    resumeAt(storage, { conversation: 1, messageId: "c2-m2" })
    renderLesson({ storage })
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    expect(await screen.findByText(CAFE_LINE)).toBeTruthy()
    expect(screen.getByText("Conversation 1 of 2")).toBeTruthy()
  })

  describe("the survey at the end of a lesson (canon Cor. 3.4)", () => {
    /** Resume into the last conversation, miss one probe, and finish. */
    const finishWithAMiss = async (
      surveys: SurveyStore
    ): Promise<StorageLike> => {
      const storage = memoryStorage()
      resumeAt(storage)
      renderLesson({ storage, surveyStore: surveys })
      await continueAtCard()

      click(/^Next/)
      answer(/Past tense.*했어요/) // valid, so a miss
      build(["카드로", "했어요"])
      answer(/Question.*할게요\?/) // the repeat, answered
      click(/Finish/)
      return storage
    }

    it("keeps the lesson's place while its survey is open, and lets it go once answered", async () => {
      const surveys = createSurveyStore(memoryStorage())
      const storage = await finishWithAMiss(surveys)
      expect(screen.getByText("Was this lesson worthwhile?")).toBeTruthy()
      expect(createResumeStore(storage).get(FIXTURE_TOPIK_KEY)).not.toBeNull()

      // A reload with the survey open: the lesson comes back, not from the
      // top, and finishing it asks again with the same miss on offer.
      cleanup()
      renderLesson({ storage, surveyStore: surveys })
      await continueAtCard()
      // Its checks were answered; stepping on passes over them to the end.
      for (let step = 0; step < 10; step += 1) {
        if (screen.queryByRole("button", { name: /Finish/ })) break
        click(/^Next/)
      }
      click(/Finish/)
      click("Yes, worth it")
      click("Too hard")
      expect(
        screen.getByRole("button", { name: /카드로 할게요\./ })
      ).toBeTruthy()

      click("Nothing was blocking")
      click("Keen for the next one")
      click("Done")
      expect(createResumeStore(storage).get(FIXTURE_TOPIK_KEY)).toBeNull()
    })

    it("asks for the learner's verdict, offers the misses as what was blocking, and keeps it", async () => {
      const surveys = createSurveyStore(memoryStorage(), () => 5)
      await finishWithAMiss(surveys)

      expect(screen.getByText("Was this lesson worthwhile?")).toBeTruthy()
      click("Yes, worth it")
      click("Too hard")
      expect(screen.getByText("Was anything blocking you?")).toBeTruthy()
      fireEvent.click(screen.getByRole("button", { name: /카드로 할게요\./ }))
      click("Continue")
      click("Keen for the next one")
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "following a drama without subtitles" },
      })
      click("Done")

      // The recap follows; the survey gated nothing.
      expect(screen.getByText("Material complete")).toBeTruthy()
      expect(surveys.list()).toEqual([
        {
          topikKey: FIXTURE_TOPIK_KEY,
          displayName: "Ordering at a café",
          level: 1,
          at: 5,
          worthwhile: "yes",
          difficulty: "too-hard",
          enthusiasm: "keen",
          stuck: [
            {
              batchId: 2,
              probeId: "c2-promise-forms",
              source: "카드로 할게요.",
              prompt: "Which is NOT a valid transformation?",
              // What the probe exercised, so a lesson that exercises it can
              // come back (canon Rem. 3.5).
              relations: ["past", "negation", "paraphrase", "question"],
            },
          ],
          becoming: "following a drama without subtitles",
        },
      ])
    })

    it("keeps what it will offer across leaving and resuming", async () => {
      const surveys = createSurveyStore(memoryStorage(), () => 7)
      const storage = memoryStorage()
      // Evidence from conversation 1, gathered before an earlier leave.
      resumeAt(storage, {
        ...AT_C2_M2,
        survey: {
          missed: pinMisses(FIXTURE_BATCHES, { 1: ["c1-request-forms"] }),
          flagged: [
            {
              batchId: 1,
              probeId: "c1-honorific",
              source: "아이스 아메리카노 한 잔 주세요.",
              prompt: "Which reply is the most polite?",
            },
          ],
        },
      })
      const store = renderLesson({ storage, surveyStore: surveys })
      await continueAtCard()

      click(/^Next/)
      answer(/Past tense.*했어요/) // valid, so a miss in conversation 2

      // Leave mid-lesson: the point now holds both conversations' misses.
      click("Back to materials")
      expect(store.get(FIXTURE_TOPIK_KEY)?.survey?.missed).toEqual(
        pinMisses(FIXTURE_BATCHES, {
          1: ["c1-request-forms"],
          2: ["c2-promise-forms"],
        })
      )

      await continueAtCard()
      click(/^Next/)
      build(["카드로", "했어요"])
      answer(/Question.*할게요\?/) // the repeat, answered
      click(/Finish/)

      click("Yes, worth it")
      click("Too hard")
      expect(screen.getByText("Was anything blocking you?")).toBeTruthy()
      expect(
        screen.getByRole("button", { name: /아이스 아메리카노/ })
      ).toBeTruthy()
      expect(
        screen.getByRole("button", { name: /카드로 할게요\./ })
      ).toBeTruthy()
      click("Nothing was blocking")
      click("Keen for the next one")
      click("Done")
      // The flag from before the leave rides the report into the next prompt.
      expect(surveys.list()[0]?.flagged?.map((item) => item.probeId)).toEqual([
        "c1-honorific",
      ])
    })

    it("can be left at once, and keeps nothing", async () => {
      const surveys = createSurveyStore(memoryStorage())
      await finishWithAMiss(surveys)
      click("Not now")
      expect(screen.getByText("Material complete")).toBeTruthy()
      expect(surveys.list()).toEqual([])
    })
  })

  describe("choosing what comes next (canon Rem. 3.5)", () => {
    /** A report that was too hard and stuck on negation. */
    const tooHardOnNegation = (): SurveyStore => {
      const surveys = createSurveyStore(memoryStorage())
      surveys.add(
        "another-lesson",
        {
          difficulty: "too-hard",
          stuck: [{ batchId: 9, probeId: "x", relations: ["negation"] }],
        },
        { level: 1 }
      )
      return surveys
    }

    it("puts the held level's lesson up next, and moves only when the learner does", async () => {
      renderLesson()
      const upNext = await screen.findByRole("region", { name: "Up next" })
      expect(upNext.textContent).toMatch(/Ordering at a café/)
      expect(
        screen
          .getByRole("radio", { name: "TOPIK 1" })
          .getAttribute("aria-checked")
      ).toBe("true")
      expect(
        screen.getByRole("region", { name: "Other levels" }).textContent
      ).toMatch(/Changing subway lines/)

      fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
      expect(
        screen.getByRole("region", { name: "Up next" }).textContent
      ).toMatch(/Changing subway lines/)
    })

    it("falls back to the operator's order, not the alphabet", async () => {
      const manifest = await fixtureMetadataRepository.loadCatalog()
      const [cafe] = manifest.topiks
      if (!cafe) throw new Error("fixture lost its café lesson")
      const zebra = { ...cafe, key: "zebra", displayName: "Zebra crossing" }
      renderLesson({
        metadataRepository: {
          loadCatalog: () =>
            Promise.resolve({ ...manifest, topiks: [zebra, cafe] }),
        },
      })
      const upNext = await screen.findByRole("region", { name: "Up next" })
      expect(upNext.textContent).toMatch(/Zebra crossing/)
      expect(upNext.textContent).not.toMatch(/Ordering at a café/)
    })

    it("says why: what blocked the learner comes back, shorter after too hard", async () => {
      // A longer twin of the café lesson, bringing back the same: size is
      // what puts the café first, so it may say so.
      const manifest = await fixtureMetadataRepository.loadCatalog()
      const [cafe, ...rest] = manifest.topiks
      if (!cafe) throw new Error("fixture lost its café lesson")
      const longer = {
        ...cafe,
        key: "cafe-long",
        displayName: "Ordering for the whole office",
        totalMessages: cafe.totalMessages * 3,
      }
      renderLesson({
        surveyStore: tooHardOnNegation(),
        metadataRepository: {
          loadCatalog: () =>
            Promise.resolve({ ...manifest, topiks: [longer, cafe, ...rest] }),
        },
      })
      const upNext = await screen.findByRole("region", { name: "Up next" })
      expect(upNext.textContent).toMatch(/Ordering at a café/)
      expect(upNext.textContent).toMatch(/Brings back negation\./)
      expect(upNext.textContent).toMatch(
        /Shorter, since the last one felt too hard\./
      )
    })

    it("does not call the only lesson at its level shorter", async () => {
      renderLesson({ surveyStore: tooHardOnNegation() })
      const upNext = await screen.findByRole("region", { name: "Up next" })
      expect(upNext.textContent).toMatch(/Brings back negation\./)
      expect(upNext.textContent).not.toMatch(/Shorter/)
    })

    it("stops ordering by a report once it expires, in a tab left open", async () => {
      let now = 1
      const surveys = createSurveyStore(memoryStorage(), () => now)
      surveys.add(
        "another-lesson",
        { worthwhile: "yes", stuck: [] },
        { level: 2 }
      )
      renderLesson({ surveyStore: surveys })
      const level = (n: number): string | null =>
        screen
          .getByRole("radio", { name: `TOPIK ${n}` })
          .getAttribute("aria-checked")
      await screen.findByRole("region", { name: "Up next" })
      expect(level(2)).toBe("true")

      now += SURVEY_TTL_MS + 1
      fireEvent(document, new Event("visibilitychange"))
      expect(level(1)).toBe("true")
    })

    it("records the level held for a lesson that has none", async () => {
      const surveys = createSurveyStore(memoryStorage())
      const pasted = createPastedLessonStore(memoryStorage())
      pasted.set(
        {
          key: "local:any-level",
          displayName: "Any level",
          description: "",
          batchCount: FIXTURE_BATCHES.length,
          totalQuestions: 1,
          totalMessages: 1,
        },
        FIXTURE_BATCHES
      )
      const session = createResumeStore(memoryStorage())
      session.set("local:any-level", AT_C2_M2)
      renderLesson({
        surveyStore: surveys,
        pastedStore: pasted,
        pastedResumeStore: session,
      })
      const held = await screen.findByRole("region", {
        name: "Pasted this session",
      })
      fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
      fireEvent.click(
        [...held.querySelectorAll("button")].find((button) =>
          button.textContent.includes("Any level")
        )!
      )
      await screen.findByText(CARD_LINE)

      click(/^Next/)
      answer(/Question.*할게요\?/)
      build(["카드로", "했어요"])
      click(/Finish/)
      click("Yes, worth it")
      click("About right")
      click("Keen for the next one")
      click("Done")

      expect(surveys.list()[0]).toMatchObject({
        topikKey: "local:any-level",
        level: 2,
      })
    })
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

    it("lists the served trees apart from the lessons, and plays one through both audits", async () => {
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
      await screen.findByRole("region", { name: "Up next" })
      expect(screen.queryByRole("region", { name: "Dramas" })).toBeNull()
    })

    it("says the dramas failed to load, and loads them again on request", async () => {
      const list = vi
        .fn<TreeFeed["list"]>()
        .mockRejectedValueOnce(new Error("500"))
        .mockResolvedValue([TEA])
      renderLesson({ treeFeed: { list, load: vi.fn() } })
      const dramas = await screen.findByRole("region", { name: "Dramas" })
      expect(dramas.textContent).toMatch(/Couldn't load the dramas/)
      fireEvent.click(within(dramas).getByRole("button", { name: "Try again" }))
      expect(await screen.findByText("Tea at the chairman's")).toBeTruthy()
      expect(screen.queryByText(/Couldn't load the dramas/)).toBeNull()
    })

    it("lists no dramas where the host serves none", async () => {
      renderLesson()
      await screen.findByRole("button", { name: /Write your own lesson/ })
      expect(screen.queryByRole("region", { name: "Dramas" })).toBeNull()
    })
  })

  describe("the learner's own lesson (canon Cor. 8.2, Rem. 7.4)", () => {
    const stubClipboard = (): ReturnType<typeof vi.fn> => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })
      return writeText
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    const modelReply = [
      "Here is the lesson:",
      "```json",
      JSON.stringify(FIXTURE_BATCHES),
      "```",
      "```json",
      JSON.stringify({
        key: "first-dinner",
        displayName: "The first family dinner",
        description: "Seo-yeon meets Chairman Kang.",
        tags: ["topik-2", "makjang"],
      }),
      "```",
    ].join("\n")

    const pasteReply = (): void => {
      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: modelReply } }
      )
      click("Check the lesson")
    }

    const writeYourOwn = async (): Promise<void> => {
      fireEvent.click(
        await screen.findByRole("button", { name: /Write your own lesson/ })
      )
      fireEvent.click(screen.getByRole("radio", { name: "Conversations" }))
    }

    it("plays a pasted scene tree as the drama, and holds it in the same slot", async () => {
      const pasted = createPastedLessonStore(memoryStorage())
      pasted.set(
        {
          key: "local:earlier",
          displayName: "An earlier lesson",
          description: "",
          batchCount: 1,
          totalQuestions: 1,
          totalMessages: 1,
        },
        FIXTURE_BATCHES
      )
      renderLesson({ pastedStore: pasted })
      fireEvent.click(
        await screen.findByRole("button", { name: /Write your own lesson/ })
      )
      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: workedExample() } }
      )
      click("Check the lesson")
      click(/^Start$/)

      expect(await screen.findByText("숨 막히는 긴장감")).toBeTruthy()
      expect(pasted.getTree()?.id).toBe("first-tea")
      expect(pasted.get()).toBeNull()

      click("Back to materials")
      const held = await screen.findByRole("region", {
        name: "Pasted this session",
      })
      expect(held.textContent).toMatch(/Drama · TOPIK 2/)
      expect(held.textContent).not.toMatch(/An earlier lesson/)
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

    it("hands out the prompt, takes the lesson back, and holds it for the session only", async () => {
      const writeText = stubClipboard()
      const pasted = createPastedLessonStore(memoryStorage())
      const surveys = createSurveyStore(memoryStorage())
      surveys.add(
        "local:earlier",
        { worthwhile: "no", stuck: [], becoming: "reading webtoons raw" },
        { displayName: "An earlier lesson" }
      )
      renderLesson({ surveyStore: surveys, pastedStore: pasted })

      await writeYourOwn()
      fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
      click(/Copy the prompt/)
      await screen.findByText(/Copied/)
      const prompt = String(writeText.mock.calls[0]?.[0])
      expect(prompt).toContain("Level: 2")
      // The survey delta rides along, in words, free text included...
      expect(prompt).toContain("1. An earlier lesson: not worthwhile.")
      expect(prompt).toContain('Making them into: "reading webtoons raw"')
      // ...and the free text is not kept once carried (canon Rem. 7.4).
      expect(surveys.list()[0]?.becoming).toBeUndefined()

      pasteReply()
      expect(
        screen.getByText(/Every probe will be asked as written/)
      ).toBeTruthy()
      click(/^Start$/)

      expect(await screen.findByText(CAFE_LINE)).toBeTruthy()
      expect(pasted.get()?.meta.key).toBe("local:first-dinner")

      // Back on the list, it is held for this session, and can be let go.
      click("Back to materials")
      const held = await screen.findByRole("region", {
        name: "Pasted this session",
      })
      expect(held.textContent).toMatch(/The first family dinner/)
      expect(held.textContent).toMatch(/until this tab closes/)
      click("Forget The first family dinner")
      expect(
        screen.queryByRole("region", { name: "Pasted this session" })
      ).toBeNull()
      expect(pasted.get()).toBeNull()
    })

    it("keeps a pasted lesson's place with the lesson: fresh on paste, gone on forget, never in localStorage", async () => {
      stubClipboard()
      const session = createResumeStore(memoryStorage())
      // A place left in an earlier lesson pasted under the same key.
      session.set("local:first-dinner", AT_C2_M2)
      const store = renderLesson({ pastedResumeStore: session })

      await writeYourOwn()
      pasteReply()
      click(/^Start$/)
      // The first line, not the old lesson's conversation 2.
      expect(await screen.findByText(CAFE_LINE)).toBeTruthy()
      expect(screen.queryByText(CARD_LINE)).toBeNull()

      click(/^Next/)
      click("Back to materials")
      // Its place is in the session, and nowhere that outlives the tab.
      expect(session.get("local:first-dinner")).not.toBeNull()
      expect(store.get("local:first-dinner")).toBeNull()
      expect(store.last()).toBeNull()

      click("Forget The first family dinner")
      expect(session.get("local:first-dinner")).toBeNull()
    })

    it("drops places left in pasted lessons kept by an older build, and offers the served one to continue", async () => {
      const storage = memoryStorage()
      const points = createResumeStore(storage)
      points.set(FIXTURE_TOPIK_KEY, AT_C2_M2)
      // Left last, in the localStorage store, by a build that kept lessons.
      points.set("local:first-dinner", {
        batchId: 1,
        conversation: 0,
        messageId: "c1-m1",
        survey: { missed: {}, flagged: [] },
      })
      const store = renderLesson({ storage })
      expect(
        await screen.findByRole("button", { name: /Continue/ })
      ).toBeTruthy()
      expect(store.get("local:first-dinner")).toBeNull()
      expect(store.last()?.topikKey).toBe(FIXTURE_TOPIK_KEY)
    })

    it("deletes what the retired lesson store left in localStorage", async () => {
      window.localStorage.setItem(RETIRED_LESSONS_KEY, "[]")
      renderLesson()
      await screen.findByRole("region", { name: "Up next" })
      expect(window.localStorage.getItem(RETIRED_LESSONS_KEY)).toBeNull()
    })

    it("keeps the survey's free text until the prompt actually reaches the learner", async () => {
      vi.stubGlobal("navigator", {
        ...navigator,
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error("denied")),
        },
      })
      const surveys = createSurveyStore(memoryStorage())
      surveys.add(
        "local:earlier",
        { stuck: [], becoming: "reading webtoons raw" },
        { displayName: "An earlier lesson" }
      )
      renderLesson({ surveyStore: surveys })
      await writeYourOwn()
      click(/Copy the prompt/)
      const manual = await screen.findByRole("textbox", {
        name: "Prompt to copy",
      })
      expect(manual.textContent).toContain("reading webtoons raw")
      expect(surveys.list()[0]?.becoming).toBe("reading webtoons raw")

      // Another tab adds a report while the fallback is open; this prompt
      // never carried it.
      surveys.add(
        "local:later",
        { stuck: [], becoming: "ordering without pointing" },
        { displayName: "A later lesson" }
      )
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

    it("plays the lesson it was handed when the device refuses to keep it", async () => {
      stubClipboard()
      const storage = memoryStorage()
      // An older lesson held under the same key, then storage that takes no
      // more.
      createPastedLessonStore(storage).set(
        {
          key: "local:first-dinner",
          displayName: "An older dinner",
          description: "",
          batchCount: 1,
          totalQuestions: 1,
          totalMessages: 1,
        },
        FIXTURE_BATCHES.slice(1)
      )
      const full: StorageLike = {
        getItem: (key) => storage.getItem(key),
        setItem: () => {
          throw new Error("QuotaExceededError")
        },
      }
      renderLesson({ pastedStore: createPastedLessonStore(full) })

      await writeYourOwn()
      pasteReply()
      click(/^Start$/)
      // The lesson just pasted, from its first conversation - not the older
      // one storage still holds under the key.
      expect(await screen.findByText(CAFE_LINE)).toBeTruthy()
      click("Back to materials")
      const held = await screen.findByRole("region", {
        name: "Pasted this session",
      })
      expect(held.textContent).toMatch(/The first family dinner/)
      expect(held.textContent).not.toMatch(/An older dinner/)
    })

    it("keeps a flagged answer for the next prompt even when the survey is skipped", async () => {
      const surveys = createSurveyStore(memoryStorage(), () => 9)
      const storage = memoryStorage()
      resumeAt(storage)
      renderLesson({ storage, surveyStore: surveys })
      await continueAtCard()

      click(/^Next/)
      pick(/Question.*할게요\?/)
      click("Check")
      click("This answer looks wrong")
      expect(
        screen.getByRole("button", { name: /Flagged for your next prompt/ })
      ).toBeTruthy()
      click(/Continue/)
      build(["카드로", "했어요"])
      click(/Finish/)
      click("Not now")

      expect(surveys.list()).toEqual([
        {
          topikKey: FIXTURE_TOPIK_KEY,
          displayName: "Ordering at a café",
          level: 1,
          at: 9,
          stuck: [],
          flagged: [
            {
              batchId: 2,
              probeId: "c2-promise-forms",
              source: "카드로 할게요.",
              prompt: "Which is NOT a valid transformation?",
            },
          ],
        },
      ])
    })
  })
})
