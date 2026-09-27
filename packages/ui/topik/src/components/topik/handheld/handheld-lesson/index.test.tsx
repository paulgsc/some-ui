import type { JSX } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ITopikRepository } from "@topik/lib/topik"
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"
import type { LessonStore } from "@topik/lib/topik/adapter/lesson-store"
import { createLessonStore } from "@topik/lib/topik/adapter/lesson-store"
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { createResumeStore } from "@topik/lib/topik/adapter/resume-point"
import type { SurveyStore } from "@topik/lib/topik/adapter/survey-store"
import { createSurveyStore } from "@topik/lib/topik/adapter/survey-store"
import { pinMisses } from "@topik/lib/topik/core/lesson-survey"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HandheldLesson } from "."
import {
  FIXTURE_BATCHES,
  FIXTURE_TOPIK_KEY,
  fixtureMetadataRepository,
  fixtureTopikRepository,
} from "./fixture"

const memoryStorage = (): StorageLike => {
  const map = new Map<string, string>()
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => void map.set(key, value),
  }
}

function renderLesson(
  storage = memoryStorage(),
  topikRepository: ITopikRepository = fixtureTopikRepository,
  surveyStore: SurveyStore = createSurveyStore(memoryStorage()),
  lessonStore: LessonStore = createLessonStore(memoryStorage())
): ReturnType<typeof createResumeStore> {
  const store = createResumeStore(storage)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const tree = (): JSX.Element => (
    <QueryClientProvider client={client}>
      <SessionConfigProvider
        value={{
          topikRepository,
          metadataRepository: fixtureMetadataRepository,
          // No voice: the ladder starts at Hangul (canon Def. 9.3).
          speechAdapter: null,
        }}
      >
        <HandheldLesson
          resumeStore={store}
          surveyStore={surveyStore}
          lessonStore={lessonStore}
        />
      </SessionConfigProvider>
    </QueryClientProvider>
  )
  render(tree())
  return store
}

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

afterEach(cleanup)

describe("HandheldLesson", () => {
  it("follows a line with a probe about it, never a first-order question (canon Cor. 4.5)", async () => {
    renderLesson()
    fireEvent.click(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    )

    expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
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

  it("judges transformations, builds one from tiles, and revisits a miss once", async () => {
    renderLesson()
    fireEvent.click(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    )
    await screen.findByText("어서 오세요. 뭐 드릴까요?")

    click(/^Next/) // reply probe
    pick(/아이스 아메리카노 한 잔 주세요/)
    click("Check")
    click(/Continue/)

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
    pick(/It honours the customer/)
    click("Check")
    click(/Continue/)

    click(/^Next/) // line 4 -> build the negation
    expect(screen.getByText("Turn this into a negative request.")).toBeTruthy()
    buildFromTiles(["포장하지", "마세요"])
    click("Check")
    expect(screen.getByText("Right")).toBeTruthy()
    click(/Continue/)

    // The missed odd-one-out, once more, before the wrap.
    expect(screen.getByText("Once more")).toBeTruthy()
    pick(/Negation.*안 주세요/)
    click("Check")
    click(/Continue/)

    expect(
      screen.getByText("3 of 4 understood on the first listen")
    ).toBeTruthy()
    expect(screen.getByText("1 revisited after the conversation")).toBeTruthy()
  })

  it("resumes at the line it was left on, by message id", async () => {
    const storage = memoryStorage()
    createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
      batchId: 2,
      conversation: 1,
      messageId: "c2-m2",
    })
    renderLesson(storage)

    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    expect(await screen.findByText("카드로 할게요. 감사합니다.")).toBeTruthy()
    expect(screen.getByText("Conversation 2 of 2")).toBeTruthy()
  })

  it("keeps the gloss out of feedback while another probe on the line is pending (Codex, #1544)", async () => {
    const storage = memoryStorage()
    createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
      batchId: 2,
      conversation: 1,
      messageId: "c2-m2",
    })
    renderLesson(storage)
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    await screen.findByText("카드로 할게요. 감사합니다.")

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

  it("keeps answered probes and promised repeats across a reload (Codex, #1544)", async () => {
    const storage = memoryStorage()
    renderLesson(storage)
    fireEvent.click(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    )
    await screen.findByText("어서 오세요. 뭐 드릴까요?")
    click(/^Next/) // the reply probe
    pick(/네, 어서 오세요/)
    click("Check")
    expect(screen.getByText(/comes back once more/)).toBeTruthy()

    // The tab reloads before Continue.
    cleanup()
    renderLesson(storage)
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))

    // Back at the probe's line; the answered probe is passed over.
    expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
    click(/^Next/)
    expect(screen.getByText("아이스 아메리카노 한 잔 주세요.")).toBeTruthy()

    click(/^Next/)
    pick(/Negation.*안 주세요/)
    click("Check")
    click(/Continue/)
    click(/^Next/)
    pick(/It honours the customer/)
    click("Check")
    click(/Continue/)
    click(/^Next/)
    buildFromTiles(["포장하지", "마세요"])
    click("Check")
    click(/Continue/)

    // The miss from before the reload still comes back.
    expect(screen.getByText("Once more")).toBeTruthy()
    pick(/아이스 아메리카노 한 잔 주세요/)
    click("Check")
    click(/Continue/)
    expect(
      screen.getByText("3 of 4 understood on the first listen")
    ).toBeTruthy()
  })

  it("finds the saved conversation by its id when the file reorders them (Codex, #1544)", async () => {
    const storage = memoryStorage()
    createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
      batchId: 2,
      conversation: 1,
      messageId: "c2-m2",
    })
    // The file now lists conversation 2 first.
    renderLesson(storage, {
      load: () => Promise.resolve([...FIXTURE_BATCHES].reverse()),
    })
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    expect(await screen.findByText("카드로 할게요. 감사합니다.")).toBeTruthy()
    expect(screen.getByText("Conversation 1 of 2")).toBeTruthy()
  })

  it("does not resume a point that cannot say which conversation it was", async () => {
    const storage = memoryStorage()
    createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
      conversation: 1,
      messageId: "c2-m2",
    })
    renderLesson(storage)
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
    expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
    expect(screen.getByText("Conversation 1 of 2")).toBeTruthy()
  })

  describe("the survey at the end of a lesson (canon Cor. 3.4)", () => {
    /** Resume into the last conversation, miss one probe, and finish. */
    const finishWithAMiss = async (
      surveys: SurveyStore
    ): Promise<StorageLike> => {
      const storage = memoryStorage()
      createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
        batchId: 2,
        conversation: 1,
        messageId: "c2-m2",
      })
      renderLesson(storage, fixtureTopikRepository, surveys)
      fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
      await screen.findByText("카드로 할게요. 감사합니다.")

      click(/^Next/)
      pick(/Past tense.*했어요/) // valid, so a miss
      click("Check")
      click(/Continue/)
      buildFromTiles(["카드로", "했어요"])
      click("Check")
      click(/Continue/)
      pick(/Question.*할게요\?/) // the repeat, answered
      click("Check")
      click(/Continue/)
      click(/Finish/)
      return storage
    }

    it("keeps the lesson's place while its survey is open, and lets it go once answered (Codex, #1554)", async () => {
      const surveys = createSurveyStore(memoryStorage())
      const storage = await finishWithAMiss(surveys)
      expect(screen.getByText("Was this lesson worthwhile?")).toBeTruthy()
      expect(createResumeStore(storage).get(FIXTURE_TOPIK_KEY)).not.toBeNull()

      // A reload with the survey open: the lesson comes back, not from the
      // top, and finishing it asks again with the same miss on offer.
      cleanup()
      renderLesson(storage, fixtureTopikRepository, surveys)
      fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
      await screen.findByText("카드로 할게요. 감사합니다.")
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
            },
          ],
          becoming: "following a drama without subtitles",
        },
      ])
    })

    it("keeps what it will offer across leaving and resuming (Codex, #1554)", async () => {
      const surveys = createSurveyStore(memoryStorage(), () => 7)
      const storage = memoryStorage()
      // Evidence from conversation 1, gathered before an earlier leave.
      createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
        batchId: 2,
        conversation: 1,
        messageId: "c2-m2",
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
      const store = renderLesson(storage, fixtureTopikRepository, surveys)
      fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
      await screen.findByText("카드로 할게요. 감사합니다.")

      click(/^Next/)
      pick(/Past tense.*했어요/) // valid, so a miss in conversation 2
      click("Check")
      click(/Continue/)

      // Leave mid-lesson: the point now holds both conversations' misses.
      click("Back to materials")
      expect(store.get(FIXTURE_TOPIK_KEY)?.survey?.missed).toEqual(
        pinMisses(FIXTURE_BATCHES, {
          1: ["c1-request-forms"],
          2: ["c2-promise-forms"],
        })
      )

      fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
      await screen.findByText("카드로 할게요. 감사합니다.")
      click(/^Next/)
      buildFromTiles(["카드로", "했어요"])
      click("Check")
      click(/Continue/)
      pick(/Question.*할게요\?/) // the repeat, answered
      click("Check")
      click(/Continue/)
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

  describe("the generation loop (canon v1.7)", () => {
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

    it("hands out the prompt, takes the lesson back, keeps it and starts it", async () => {
      const writeText = stubClipboard()
      const lessons = createLessonStore(memoryStorage())
      const surveys = createSurveyStore(memoryStorage())
      surveys.add(
        "local:earlier",
        { worthwhile: "no", stuck: [] },
        "An earlier lesson"
      )
      renderLesson(memoryStorage(), fixtureTopikRepository, surveys, lessons)

      fireEvent.click(
        await screen.findByRole("button", { name: /Write a new lesson/ })
      )
      fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
      click(/Copy the prompt/)
      await screen.findByText(/Copied/)
      const prompt = String(writeText.mock.calls[0]?.[0])
      expect(prompt).toContain("Level: 2")
      // The survey delta rides along, in words.
      expect(prompt).toContain("1. An earlier lesson: not worthwhile.")

      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: modelReply } }
      )
      click("Check the lesson")
      expect(
        screen.getByText(/Every probe will be asked as written/)
      ).toBeTruthy()
      click(/Save and start/)

      expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
      expect(lessons.list().map((lesson) => lesson.meta.key)).toEqual([
        "local:first-dinner",
      ])

      // Back on the list, it is one of the learner's own.
      click("Back to materials")
      const mine = await screen.findByRole("region", { name: "Your lessons" })
      expect(mine.textContent).toMatch(/The first family dinner/)
      expect(mine.textContent).toMatch(/TOPIK 2/)
    })

    it("starts a lesson saved under an old key fresh, and removing it takes its place with it (Codex, #1554)", async () => {
      stubClipboard()
      const resume = memoryStorage()
      // A place left in an earlier lesson that had the same key.
      const points = createResumeStore(resume)
      points.set("local:first-dinner", {
        batchId: 2,
        conversation: 1,
        messageId: "c2-m2",
      })
      const lessons = createLessonStore(memoryStorage())
      renderLesson(resume, fixtureTopikRepository, undefined, lessons)

      fireEvent.click(
        await screen.findByRole("button", { name: /Write a new lesson/ })
      )
      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: modelReply } }
      )
      click("Check the lesson")
      click(/Save and start/)
      // The first line, not the old lesson's conversation 2.
      expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
      expect(screen.queryByText("카드로 할게요. 감사합니다.")).toBeNull()

      click(/^Next/)
      click("Back to materials")
      expect(points.get("local:first-dinner")).not.toBeNull()
      click("Remove The first family dinner")
      expect(points.get("local:first-dinner")).toBeNull()
    })

    it("plays the lesson it was handed when the device refuses to keep it (Codex, #1554)", async () => {
      stubClipboard()
      const storage = memoryStorage()
      // An older lesson under the same key, then storage that takes no more.
      createLessonStore(storage).save(
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
      renderLesson(
        memoryStorage(),
        fixtureTopikRepository,
        undefined,
        createLessonStore(full)
      )

      fireEvent.click(
        await screen.findByRole("button", { name: /Write a new lesson/ })
      )
      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: modelReply } }
      )
      click("Check the lesson")
      click(/Save and start/)
      // The lesson just pasted, from its first conversation - not the older
      // one storage still holds under the key.
      expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
      click("Back to materials")
      const mine = await screen.findByRole("region", { name: "Your lessons" })
      expect(mine.textContent).toMatch(/The first family dinner/)
      expect(mine.textContent).not.toMatch(/An older dinner/)
    })

    it("keeps a flagged answer for the next prompt even when the survey is skipped", async () => {
      const surveys = createSurveyStore(memoryStorage(), () => 9)
      const storage = memoryStorage()
      createResumeStore(storage).set(FIXTURE_TOPIK_KEY, {
        batchId: 2,
        conversation: 1,
        messageId: "c2-m2",
      })
      renderLesson(storage, fixtureTopikRepository, surveys)
      fireEvent.click(await screen.findByRole("button", { name: /Continue/ }))
      await screen.findByText("카드로 할게요. 감사합니다.")

      click(/^Next/)
      pick(/Question.*할게요\?/)
      click("Check")
      click("This answer looks wrong")
      expect(
        screen.getByRole("button", { name: /Flagged for your next prompt/ })
      ).toBeTruthy()
      click(/Continue/)
      buildFromTiles(["카드로", "했어요"])
      click("Check")
      click(/Continue/)
      click(/Finish/)
      click("Not now")

      expect(surveys.list()).toEqual([
        {
          topikKey: FIXTURE_TOPIK_KEY,
          displayName: "Ordering at a café",
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
