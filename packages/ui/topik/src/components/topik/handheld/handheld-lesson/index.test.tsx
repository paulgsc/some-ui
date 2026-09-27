import type { JSX } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
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
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { createResumeStore } from "@topik/lib/topik/adapter/resume-point"
import type { SurveyStore } from "@topik/lib/topik/adapter/survey-store"
import {
  createSurveyStore,
  SURVEY_TTL_MS,
} from "@topik/lib/topik/adapter/survey-store"
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
  pastedStore: PastedLessonStore = createPastedLessonStore(memoryStorage()),
  pastedResumeStore = createResumeStore(memoryStorage()),
  metadataRepository: ITopikMetadataRepository = fixtureMetadataRepository,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
): ReturnType<typeof createResumeStore> {
  const store = createResumeStore(storage)
  const tree = (): JSX.Element => (
    <QueryClientProvider client={client}>
      <SessionConfigProvider
        value={{
          topikRepository,
          metadataRepository,
          // No voice: the ladder starts at Hangul (canon Def. 9.3).
          speechAdapter: null,
        }}
      >
        <HandheldLesson
          resumeStore={store}
          surveyStore={surveyStore}
          pastedStore={pastedStore}
          pastedResumeStore={pastedResumeStore}
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

  it("keeps a miss pinned to the probe that was missed when the file refreshes (Codex, #1554)", async () => {
    let batches = FIXTURE_BATCHES
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const storage = memoryStorage()
    const store = renderLesson(
      storage,
      { load: () => Promise.resolve(batches) },
      undefined,
      undefined,
      undefined,
      undefined,
      client
    )
    fireEvent.click(
      await screen.findByRole("button", { name: /Ordering at a café/ })
    )
    await screen.findByText("어서 오세요. 뭐 드릴까요?")
    click(/^Next/)
    pick(/아이스 아메리카노 한 잔 주세요/)
    click("Check")
    click(/Continue/)
    click(/^Next/)
    pick(/Same meaning.*부탁해요/) // valid, so a miss
    click("Check")
    click(/Continue/)

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
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // A later miss in the same conversation is pinned to what it is now;
    // the earlier one keeps the pin it was missed under.
    click(/^Next/)
    pick(/past tense/)
    click("Check")
    click(/Continue/)

    click("Back to materials")
    expect(store.get(FIXTURE_TOPIK_KEY)?.survey?.missed).toEqual({
      1: [
        ...(pinMisses(FIXTURE_BATCHES, { 1: ["c1-request-forms"] })[1] ?? []),
        ...(pinMisses(revised, { 1: ["c1-honorific"] })[1] ?? []),
      ],
    })
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

  describe("choosing what comes next (canon Rem. 3.5)", () => {
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

    it("falls back to the operator's order, not the alphabet (Codex, #1555)", async () => {
      const manifest = await fixtureMetadataRepository.loadCatalog()
      const [cafe] = manifest.topiks
      if (!cafe) throw new Error("fixture lost its café lesson")
      const zebra = { ...cafe, key: "zebra", displayName: "Zebra crossing" }
      renderLesson(
        memoryStorage(),
        fixtureTopikRepository,
        undefined,
        undefined,
        undefined,
        {
          loadCatalog: () =>
            Promise.resolve({ ...manifest, topiks: [zebra, cafe] }),
        }
      )
      const upNext = await screen.findByRole("region", { name: "Up next" })
      expect(upNext.textContent).toMatch(/Zebra crossing/)
      expect(upNext.textContent).not.toMatch(/Ordering at a café/)
    })

    it("says why: what blocked the learner comes back, shorter after too hard", async () => {
      const surveys = createSurveyStore(memoryStorage())
      surveys.add(
        "another-lesson",
        {
          difficulty: "too-hard",
          stuck: [{ batchId: 9, probeId: "x", relations: ["negation"] }],
        },
        { level: 1 }
      )
      // A longer twin of the café lesson, bringing back the same: size is
      // what puts the café first, so it may say so (Codex, #1555).
      const manifest = await fixtureMetadataRepository.loadCatalog()
      const [cafe, ...rest] = manifest.topiks
      if (!cafe) throw new Error("fixture lost its café lesson")
      const longer = {
        ...cafe,
        key: "cafe-long",
        displayName: "Ordering for the whole office",
        totalMessages: cafe.totalMessages * 3,
      }
      renderLesson(
        memoryStorage(),
        fixtureTopikRepository,
        surveys,
        undefined,
        undefined,
        {
          loadCatalog: () =>
            Promise.resolve({ ...manifest, topiks: [longer, cafe, ...rest] }),
        }
      )
      const upNext = await screen.findByRole("region", { name: "Up next" })
      expect(upNext.textContent).toMatch(/Ordering at a café/)
      expect(upNext.textContent).toMatch(/Brings back negation\./)
      expect(upNext.textContent).toMatch(
        /Shorter, since the last one felt too hard\./
      )
    })

    it("does not call the only lesson at its level shorter (Codex, #1555)", async () => {
      const surveys = createSurveyStore(memoryStorage())
      surveys.add(
        "another-lesson",
        {
          difficulty: "too-hard",
          stuck: [{ batchId: 9, probeId: "x", relations: ["negation"] }],
        },
        { level: 1 }
      )
      renderLesson(memoryStorage(), fixtureTopikRepository, surveys)
      const upNext = await screen.findByRole("region", { name: "Up next" })
      expect(upNext.textContent).toMatch(/Brings back negation\./)
      expect(upNext.textContent).not.toMatch(/Shorter/)
    })

    it("stops ordering by a report once it expires, in a tab left open (Codex, #1555)", async () => {
      let now = 1
      const surveys = createSurveyStore(memoryStorage(), () => now)
      surveys.add(
        "another-lesson",
        { worthwhile: "yes", stuck: [] },
        { level: 2 }
      )
      renderLesson(memoryStorage(), fixtureTopikRepository, surveys)
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

    it("records the level held for a lesson that has none (Codex, #1555)", async () => {
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
      session.set("local:any-level", {
        batchId: 2,
        conversation: 1,
        messageId: "c2-m2",
      })
      renderLesson(
        memoryStorage(),
        fixtureTopikRepository,
        surveys,
        pasted,
        session
      )
      const held = await screen.findByRole("region", {
        name: "Pasted this session",
      })
      fireEvent.click(screen.getByRole("radio", { name: "TOPIK 2" }))
      fireEvent.click(
        [...held.querySelectorAll("button")].find((button) =>
          button.textContent.includes("Any level")
        )!
      )
      await screen.findByText("카드로 할게요. 감사합니다.")

      click(/^Next/)
      pick(/Question.*할게요\?/)
      click("Check")
      click(/Continue/)
      buildFromTiles(["카드로", "했어요"])
      click("Check")
      click(/Continue/)
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

    it("hands out the prompt, takes the lesson back, and holds it for the session only", async () => {
      const writeText = stubClipboard()
      const pasted = createPastedLessonStore(memoryStorage())
      const surveys = createSurveyStore(memoryStorage())
      surveys.add(
        "local:earlier",
        { worthwhile: "no", stuck: [], becoming: "reading webtoons raw" },
        { displayName: "An earlier lesson" }
      )
      renderLesson(memoryStorage(), fixtureTopikRepository, surveys, pasted)

      fireEvent.click(
        await screen.findByRole("button", { name: /Write your own lesson/ })
      )
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

      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: modelReply } }
      )
      click("Check the lesson")
      expect(
        screen.getByText(/Every probe will be asked as written/)
      ).toBeTruthy()
      click(/^Start$/)

      expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
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

    it("keeps a pasted lesson's place with the lesson: fresh on paste, gone on forget, never in localStorage (Codex, #1554, #1555)", async () => {
      stubClipboard()
      const served = memoryStorage()
      const session = createResumeStore(memoryStorage())
      // A place left in an earlier lesson pasted under the same key.
      session.set("local:first-dinner", {
        batchId: 2,
        conversation: 1,
        messageId: "c2-m2",
      })
      const store = renderLesson(
        served,
        fixtureTopikRepository,
        undefined,
        undefined,
        session
      )

      fireEvent.click(
        await screen.findByRole("button", { name: /Write your own lesson/ })
      )
      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: modelReply } }
      )
      click("Check the lesson")
      click(/^Start$/)
      // The first line, not the old lesson's conversation 2.
      expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
      expect(screen.queryByText("카드로 할게요. 감사합니다.")).toBeNull()

      click(/^Next/)
      click("Back to materials")
      // Its place is in the session, and nowhere that outlives the tab.
      expect(session.get("local:first-dinner")).not.toBeNull()
      expect(store.get("local:first-dinner")).toBeNull()
      expect(store.last()).toBeNull()

      click("Forget The first family dinner")
      expect(session.get("local:first-dinner")).toBeNull()
    })

    it("drops places left in pasted lessons kept by an older build, and offers the served one to continue (Codex, #1555)", async () => {
      const storage = memoryStorage()
      const points = createResumeStore(storage)
      points.set(FIXTURE_TOPIK_KEY, {
        batchId: 2,
        conversation: 1,
        messageId: "c2-m2",
      })
      // Left last, in the localStorage store, by a build that kept lessons.
      points.set("local:first-dinner", {
        batchId: 1,
        conversation: 0,
        messageId: "c1-m1",
        survey: { missed: {}, flagged: [] },
      })
      const store = renderLesson(storage)
      expect(
        await screen.findByRole("button", { name: /Continue/ })
      ).toBeTruthy()
      expect(store.get("local:first-dinner")).toBeNull()
      expect(store.last()?.topikKey).toBe(FIXTURE_TOPIK_KEY)
    })

    it("deletes what the retired lesson store left in localStorage (Codex, #1555)", async () => {
      window.localStorage.setItem(RETIRED_LESSONS_KEY, "[]")
      renderLesson()
      await screen.findByRole("region", { name: "Up next" })
      expect(window.localStorage.getItem(RETIRED_LESSONS_KEY)).toBeNull()
    })

    it("keeps the survey's free text until the prompt actually reaches the learner (Codex, #1555)", async () => {
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
      renderLesson(memoryStorage(), fixtureTopikRepository, surveys)
      fireEvent.click(
        await screen.findByRole("button", { name: /Write your own lesson/ })
      )
      click(/Copy the prompt/)
      const manual = await screen.findByRole("textbox", {
        name: "Prompt to copy",
      })
      expect(manual.textContent).toContain("reading webtoons raw")
      expect(surveys.list()[0]?.becoming).toBe("reading webtoons raw")

      // Another tab adds a report while the fallback is open; this prompt
      // never carried it (Codex, #1555).
      surveys.add(
        "local:later",
        { stuck: [], becoming: "ordering without pointing" },
        { displayName: "A later lesson" }
      )
      // A second prompt, carrying it, is built while the clipboard hangs;
      // the fallback on screen is still the first prompt.
      vi.stubGlobal("navigator", {
        ...navigator,
        clipboard: { writeText: () => new Promise<void>(() => undefined) },
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

    it("plays the lesson it was handed when the device refuses to keep it (Codex, #1554)", async () => {
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
      renderLesson(
        memoryStorage(),
        fixtureTopikRepository,
        undefined,
        createPastedLessonStore(full)
      )

      fireEvent.click(
        await screen.findByRole("button", { name: /Write your own lesson/ })
      )
      fireEvent.change(
        screen.getByRole("textbox", { name: "Your model's reply" }),
        { target: { value: modelReply } }
      )
      click("Check the lesson")
      click(/^Start$/)
      // The lesson just pasted, from its first conversation - not the older
      // one storage still holds under the key.
      expect(await screen.findByText("어서 오세요. 뭐 드릴까요?")).toBeTruthy()
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
