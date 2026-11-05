/**
 * New idea as one bundle (ST26), rendered over the real take pattern on the
 * shared simulated microphone, with `send: "on-confirm"`, and the real draft
 * and idea stores in a page's storage: what a person sees at each step.
 *
 * The swipe is driven with synthetic touches through the shared pager, which
 * prove what it moves, not a phone's touch (CK7, #2386).
 */
import type { ReactNode } from "react"
import { inMemoryStorage } from "@some-ui/core-utils"
import { ONE_TAKE, TAKE_WORDS } from "@some-ui/voice-capture"
import { simulatedPattern, SPEAKING } from "@some-ui/voice-capture/testing"
import { IdeaBundle } from "@soundbites/components/idea-bundle"
import { bundleTakesOf } from "@soundbites/fixtures"
import type { HomeReach } from "@soundbites/lib/idea/bundle"
import { keptDraftStore } from "@soundbites/lib/idea/draft"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const WORDS = STUDIO_WORDS.bundle
const ASK = STUDIO_WORDS.idea.questions

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

function mount(
  reach: HomeReach = "unpaired",
  pair?: ReactNode
): ReturnType<typeof simulatedPattern> {
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
        home: { reach: () => reach, subscribe: () => (): void => undefined },
      }}
      pair={pair}
    />
  )
  return simulated
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

/**
 * A drag across the cards, `dx` pixels, as a finger makes it: begun on
 * `from` (the cards themselves unless said), and ending, as a phone's does,
 * in a click on where it began.
 */
function drag(dx: number, from?: HTMLElement): void {
  const cards = document.querySelector<HTMLElement>("[data-swipe='cards']")
  if (cards === null) throw new Error("no cards")
  const on = from ?? cards
  const at = (x: number): { touches: Array<Partial<Touch>> } => ({
    touches: [{ clientX: x, clientY: 300, identifier: 0 }],
  })
  fireEvent.touchStart(on, at(200))
  fireEvent.touchMove(on, at(200 + dx / 2))
  fireEvent.touchMove(on, at(200 + dx))
  fireEvent.touchEnd(on, { touches: [] })
  fireEvent.click(on)
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

  it("starts no take when a swipe begins on the take button", async () => {
    mount()
    await pass()
    toQuestions()
    drag(-90, button(TAKE_WORDS.buttonLabel.ready))
    await pass()
    expect(card()).toHaveAccessibleName(WORDS.questionOf(2, 4))
    expect(
      screen.queryByRole("button", { name: TAKE_WORDS.buttonLabel.recording })
    ).not.toBeInTheDocument()
    // The next plain tap is a tap.
    fireEvent.click(button(TAKE_WORDS.buttonLabel.ready))
    await pass(500)
    expect(button(TAKE_WORDS.buttonLabel.recording)).toBeInTheDocument()
    fireEvent.click(button(TAKE_WORDS.buttonLabel.recording))
    await pass()
  })

  it("says each answer, hears it back, and deletes it for good only once asked", async () => {
    mount()
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
    fireEvent.click(button(WORDS.confirm.yes))
    await pass()
    expect(screen.getByText(TAKE_WORDS.discarded)).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^Play the take of/ })
    ).not.toBeInTheDocument()
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

  it("keeps a take with no voice heard in it, says so, and offers typing beside it, marked (ST34)", async () => {
    const { mic } = mount()
    await pass()
    toQuestions()
    mic.script({ ...SPEAKING, level: 0 })
    await say()
    expect(card()).toHaveTextContent(TAKE_WORDS.ended.unheard)
    fireEvent.click(button(new RegExp(WORDS.unheard.type)))
    expect(card().querySelector("[data-typing='fallback']")).toHaveTextContent(
      WORDS.typing.mark
    )
    fireEvent.change(screen.getByLabelText(WORDS.typing.hint), {
      target: { value: "Two hearings disagreed" },
    })
    fireEvent.click(button(WORDS.typing.keep))
    expect(card().querySelector("[data-typing='kept']")).toHaveTextContent(
      WORDS.typed.mark
    )
    expect(
      screen.getByRole("button", { name: WORDS.dot.typed(1) })
    ).toBeInTheDocument()
  })

  it("says a full phone is a full phone, not voice failing, and offers typing and later, not again", async () => {
    const { keeping } = mount()
    await pass()
    toQuestions()
    keeping("full")
    await say()
    expect(screen.getByRole("status")).toHaveTextContent(WORDS.full.title)
    expect(screen.getByRole("status")).not.toHaveTextContent(WORDS.failed.title)
    expect(
      screen.queryByRole("button", { name: WORDS.failed.again })
    ).not.toBeInTheDocument()
    expect(button(WORDS.failed.later)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: WORDS.dot.full(1) })
    ).toBeInTheDocument()
    fireEvent.click(button(WORDS.failed.type))
    expect(card().querySelector("[data-typing='fallback']")).toHaveTextContent(
      WORDS.typing.mark
    )
  })

  it("looks it over: what it still needs to send, and Delete all asked first", async () => {
    mount()
    await pass()
    toQuestions()
    fireEvent.click(button(WORDS.toReview))
    expect(screen.getByText(WORDS.review.kept)).toBeInTheDocument()
    expect(screen.getByText(WORDS.review.needsFirst)).toBeInTheDocument()
    expect(button(WORDS.review.keep(0))).toBeDisabled()
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
  })

  it("sends the whole idea home once it has a title and the first answer", async () => {
    mount("near")
    await pass()
    toQuestions()
    await say()
    fireEvent.click(button(WORDS.toReview))
    expect(
      screen.queryByText(WORDS.review.notNear.away)
    ).not.toBeInTheDocument()
    fireEvent.click(button(WORDS.review.send(1)))
    expect(
      screen.getByRole("heading", { name: WORDS.sent.title })
    ).toBeInTheDocument()
    expect(screen.getByText(WORDS.sent.near)).toBeInTheDocument()
    expect(screen.getByText("Two hearings, one word")).toBeInTheDocument()
  })

  it("away from home, keeps the idea and says it goes home when back in reach, with no way to pairing", async () => {
    mount("away")
    await pass()
    toQuestions()
    await say()
    fireEvent.click(button(WORDS.toReview))
    expect(screen.getByText(WORDS.review.notNear.away)).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: WORDS.review.send(1) })
    ).not.toBeInTheDocument()
    fireEvent.click(button(WORDS.review.keep(1)))
    expect(
      screen.getByRole("heading", { name: WORDS.sent.notNear.away.title })
    ).toBeInTheDocument()
    expect(screen.getByText(WORDS.sent.notNear.away.line)).toBeInTheDocument()
    expect(screen.queryByText(STUDIO_WORDS.pair.where)).not.toBeInTheDocument()
  })

  it("on a phone never paired, says so rather than out of reach, and offers the app's way to pairing (ST34)", async () => {
    mount("unpaired", <a href="#pair">{STUDIO_WORDS.pair.pair}</a>)
    await pass()
    toQuestions()
    await say()
    fireEvent.click(button(WORDS.toReview))
    expect(screen.getByText(WORDS.review.notNear.unpaired)).toBeInTheDocument()
    expect(
      screen.queryByText(WORDS.review.notNear.away)
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: STUDIO_WORDS.pair.pair })
    ).toBeInTheDocument()
    fireEvent.click(button(WORDS.review.keep(1)))
    expect(
      screen.getByRole("heading", { name: WORDS.sent.notNear.unpaired.title })
    ).toBeInTheDocument()
    expect(
      screen.getByText(WORDS.sent.notNear.unpaired.line)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: STUDIO_WORDS.pair.pair })
    ).toBeInTheDocument()
  })

  it("on a phone never paired, with no way handed in, says where pairing is (ST34)", async () => {
    mount("unpaired")
    await pass()
    toQuestions()
    await say()
    fireEvent.click(button(WORDS.toReview))
    expect(screen.getByText(STUDIO_WORDS.pair.where)).toBeInTheDocument()
  })
})
