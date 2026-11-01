/**
 * New idea as one bundle (ST26), rendered over the real take pattern on the
 * shared simulated microphone, with `send: "on-confirm"`, and the real draft
 * and idea stores in a page's storage: what a person sees at each step.
 *
 * The swipe is driven with synthetic pointer events, which prove the
 * gesture's arithmetic and what it moves, not a phone's touch (CK7, #2386).
 */
import { inMemoryStorage } from "@some-ui/core-utils"
import { ONE_TAKE, TAKE_WORDS } from "@some-ui/voice-capture"
import { simulatedPattern, SPEAKING } from "@some-ui/voice-capture/testing"
import { IdeaBundle } from "@soundbites/components/idea-bundle"
import { bundleTakesOf } from "@soundbites/fixtures"
import { keptDraftStore } from "@soundbites/lib/idea/draft"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const WORDS = STUDIO_WORDS.bundle
const ASK = STUDIO_WORDS.idea.questions

// jsdom has no PointerEvent, so a fired one would lose its `clientX`: a
// MouseEvent of the pointer's type carries it, as a phone's does.
if (typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {}
  vi.stubGlobal("PointerEvent", PointerEvent)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const pass = (ms = 0): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

function mount(): ReturnType<typeof simulatedPattern> & {
  readonly storage: Storage
} {
  const storage = inMemoryStorage()
  const simulated = simulatedPattern({
    options: { ...ONE_TAKE, send: "on-confirm" },
  })
  render(
    <IdeaBundle
      takes={bundleTakesOf(simulated)}
      ports={{
        drafts: keptDraftStore(() => storage),
        ideas: keptIdeaStore(() => storage),
        newId: () => "idea-1",
      }}
    />
  )
  return { ...simulated, storage }
}

const button = (name: string | RegExp): HTMLElement =>
  screen.getByRole("button", { name })

/** Past what it is, titled, to the first question. */
function toQuestions(): void {
  fireEvent.change(screen.getByLabelText(WORDS.about.title), {
    target: { value: "Two hearings, one word" },
  })
  fireEvent.click(button(WORDS.about.start))
}

/** The card on screen: the one region not hidden. */
const card = (): HTMLElement =>
  screen.getByRole("region", { name: /Question \d of 4/ })

/** A drag across the cards, `dx` pixels, as a finger makes it. */
function drag(dx: number): void {
  const cards = document.querySelector<HTMLElement>("[data-swipe='cards']")
  if (cards === null) throw new Error("no cards")
  fireEvent.pointerDown(cards, { clientX: 200 })
  fireEvent.pointerMove(cards, { clientX: 200 + dx })
  fireEvent.pointerUp(cards, { clientX: 200 + dx })
}

async function say(): Promise<void> {
  fireEvent.click(button(TAKE_WORDS.buttonLabel.ready))
  await pass(2_000)
  fireEvent.click(button(TAKE_WORDS.buttonLabel.recording))
  await pass()
}

describe("New idea, one bundle (ST26)", () => {
  it("asks what it is first, dated, with its format, a title held to 80 characters, a subject and keywords", async () => {
    mount()
    await pass()
    expect(
      screen.getByRole("heading", { name: WORDS.about.heading })
    ).toBeInTheDocument()
    expect(button(WORDS.about.formats.short)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    fireEvent.click(button(WORDS.about.formats.video))
    expect(button(WORDS.about.formats.video)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByLabelText(WORDS.about.title)).toHaveAttribute(
      "maxLength",
      "80"
    )
    fireEvent.click(button("Korean"))
    expect(button("Korean")).toHaveAttribute("aria-pressed", "true")
    expect(button("Studio")).toHaveAttribute("aria-pressed", "false")
  })

  it("swipes between the questions with a drag, and a short one moves nothing", async () => {
    mount()
    await pass()
    toQuestions()
    expect(card()).toHaveAccessibleName(WORDS.questionOf(1, 4))
    drag(-20)
    expect(card()).toHaveAccessibleName(WORDS.questionOf(1, 4))
    drag(-90)
    expect(card()).toHaveAccessibleName(WORDS.questionOf(2, 4))
    expect(card()).toHaveTextContent(ASK.takeaway.ask)
    drag(90)
    expect(card()).toHaveAccessibleName(WORDS.questionOf(1, 4))
    fireEvent.click(button(WORDS.dot.open(4)))
    expect(card()).toHaveTextContent(ASK.picture.ask)
  })

  it("holds the cards still while a take is under way", async () => {
    mount()
    await pass()
    toQuestions()
    fireEvent.click(button(TAKE_WORDS.buttonLabel.ready))
    await pass(500)
    drag(-90)
    expect(card()).toHaveTextContent(ASK.what.ask)
    fireEvent.click(button(TAKE_WORDS.buttonLabel.recording))
    await pass()
  })

  it("says each answer, hears it back, and deletes it for good only once asked", async () => {
    const { store } = mount()
    await pass()
    toQuestions()
    await say()
    expect(card()).toHaveTextContent(TAKE_WORDS.place.unsent)
    expect(
      screen.getByRole("button", { name: /^Play the take of/ })
    ).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: /^Delete the take/ }))
    expect(
      screen.getByRole("dialog", { name: WORDS.confirm.answerTitle })
    ).toHaveTextContent(WORDS.confirm.answerLine(ASK.what.ask))
    expect(store.getSnapshot()).toHaveLength(1)
    fireEvent.click(button(WORDS.confirm.yes))
    await pass()
    expect(store.getSnapshot()).toEqual([])
    expect(screen.getByText(TAKE_WORDS.discarded)).toBeInTheDocument()
  })

  it("says voice didn't come through as what was meant, and offers typing, marked, only then", async () => {
    const { mic } = mount()
    await pass()
    toQuestions()
    expect(screen.queryByText(WORDS.failed.type)).not.toBeInTheDocument()
    mic.script({
      ...SPEAKING,
      open: { kind: "refuse", reason: "denied", ms: 10 },
    })
    fireEvent.click(button(TAKE_WORDS.buttonLabel.ready))
    await pass(50)
    expect(screen.getByRole("status")).toHaveTextContent(WORDS.failed.title)
    expect(button(WORDS.failed.again)).toBeInTheDocument()
    expect(button(WORDS.failed.later)).toBeInTheDocument()
    fireEvent.click(button(WORDS.failed.type))
    const typing = card().querySelector("[data-typing='fallback']")
    expect(typing).toHaveTextContent(WORDS.typing.mark)
    fireEvent.change(screen.getByLabelText(WORDS.typing.hint), {
      target: { value: "Two hearings disagreed" },
    })
    fireEvent.click(button(WORDS.typing.keep))
    expect(card().querySelector("[data-typing='kept']")).toHaveTextContent(
      WORDS.typed.mark
    )
    expect(button(WORDS.typed.sayInstead)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: WORDS.dot.typed(1) })
    ).toBeInTheDocument()
  })

  it("looks it over: what it still needs to send, and Delete all asked first", async () => {
    const { storage } = mount()
    await pass()
    toQuestions()
    fireEvent.click(button(WORDS.toReview))
    expect(screen.getByText(WORDS.review.kept)).toBeInTheDocument()
    expect(screen.getByText(WORDS.review.needsFirst)).toBeInTheDocument()
    expect(button(WORDS.review.send(0))).toBeDisabled()
    fireEvent.click(button(WORDS.review.deleteAll))
    expect(
      screen.getByRole("dialog", { name: WORDS.confirm.allTitle })
    ).toBeInTheDocument()
    fireEvent.click(button(WORDS.confirm.yes))
    await pass()
    expect(
      screen.getByRole("heading", { name: WORDS.about.heading })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(WORDS.about.title)).toHaveValue("")
    expect(keptDraftStore(() => storage).read()).toBeNull()
  })

  it("sends the whole idea once it has a title and the first answer, and says where it is", async () => {
    const { storage } = mount()
    await pass()
    toQuestions()
    await say()
    fireEvent.click(button(WORDS.toReview))
    fireEvent.click(button(WORDS.review.send(1)))
    expect(
      screen.getByRole("heading", { name: WORDS.sent.title })
    ).toBeInTheDocument()
    expect(keptIdeaStore(() => storage).list()).toEqual([
      expect.objectContaining({
        about: expect.objectContaining({ title: "Two hearings, one word" }),
      }),
    ])
  })
})
