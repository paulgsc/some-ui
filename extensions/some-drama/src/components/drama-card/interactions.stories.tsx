import "@drama/styles/content.css"

import { useEffect, useRef } from "react"
import { cardState } from "@drama/components/__fixtures__/card-state"
import type { CardSize, CardState, MoodType } from "@drama/types"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, userEvent, waitFor } from "@storybook/test"

import { DramaCard } from "."

// ── Interaction bridge ────────────────────────────────────────────────────────
// Mounts a full DramaCard with spy event handlers so play functions can pin the
// card's behaviour (DRM-STORY S3): circle-click slide advance, the size cycle,
// capture-panel toggle, and mood emission. Event args are asserted via the
// `fn()` spies, which Storybook resets between stories.

type InteractionArgs = {
  size: CardSize
  onMoodSelect: (mood: MoodType) => void
  onSizeChange: (size: CardSize) => void
  onDragEnd: (x: number, y: number) => void
}

const FIXTURE: CardState = cardState({ activeMood: "love" })

const InteractiveCard = ({
  size,
  onMoodSelect,
  onSizeChange,
  onDragEnd,
}: InteractionArgs) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<DramaCard | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || cardRef.current) return

    const card = new DramaCard(
      host,
      { ...FIXTURE },
      { onMoodSelect, onSizeChange, onDragEnd }
    )
    card.setPosition(120, 120)
    card.setSize(size, /* emit */ false)
    cardRef.current = card

    return () => {
      card.destroy()
      cardRef.current = null
    }
    // Mount once — play functions drive the instance directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={hostRef}
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, hsl(220 30% 18%), hsl(240 25% 12%))",
      }}
    />
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const rootEl = (c: HTMLElement): HTMLElement =>
  c.querySelector<HTMLElement>("#dc-root")!

const find = <T extends HTMLElement>(c: HTMLElement, sel: string): Promise<T> =>
  waitFor((): T => {
    const node = c.querySelector<T>(sel)
    if (!node) throw new Error(`element not found: ${sel}`)
    return node
  })

const activeSlideIndex = (c: HTMLElement): number =>
  Array.from(c.querySelectorAll(".dc-slide")).findIndex((s) =>
    s.classList.contains("dc-slide-active")
  )

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<InteractionArgs> = {
  title: "Extensions/Drama/DramaCard/Interactions",
  component: InteractiveCard,
  parameters: { layout: "fullscreen" },
  args: {
    size: "compact",
    onMoodSelect: fn(),
    onSizeChange: fn(),
    onDragEnd: fn(),
  },
  argTypes: {
    onMoodSelect: { table: { disable: true } },
    onSizeChange: { table: { disable: true } },
    onDragEnd: { table: { disable: true } },
  },
  tags: ["!autodocs"],
}

export default meta
type Story = StoryObj<InteractionArgs>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Clicking the circle advances the slideshow by one slide. */
export const CircleAdvancesSlide: Story = {
  play: async ({ canvasElement }) => {
    const wrap = await find(canvasElement, ".dc-circle-wrap")
    await waitFor(() => expect(activeSlideIndex(canvasElement)).toBe(0))
    const count = canvasElement.querySelectorAll(".dc-slide").length
    await userEvent.click(wrap)
    await waitFor(() => expect(activeSlideIndex(canvasElement)).toBe(1 % count))
  },
}

/**
 * The size button cycles compact → full → min → compact, and minimising
 * auto-closes an open capture panel.
 */
export const SizeCycleClosesPanelOnMin: Story = {
  play: async ({ canvasElement }) => {
    const root = rootEl(canvasElement)
    const wrap = await find(canvasElement, ".dc-circle-wrap")
    const sizeBtn = await find(canvasElement, ".dc-size-btn")
    const panel = await find(canvasElement, ".dc-capture-panel")

    await waitFor(() => expect(root.dataset.size).toBe("compact"))

    // Open the capture panel (a click inside the card toggles it).
    await userEvent.click(wrap)
    await waitFor(() =>
      expect(panel.classList.contains("dc-panel-open")).toBe(true)
    )

    // compact → full — panel stays open.
    await userEvent.click(sizeBtn)
    await waitFor(() => expect(root.dataset.size).toBe("full"))
    await waitFor(() =>
      expect(panel.classList.contains("dc-panel-open")).toBe(true)
    )

    // full → min — panel auto-closes.
    await userEvent.click(sizeBtn)
    await waitFor(() => expect(root.dataset.size).toBe("min"))
    await waitFor(() =>
      expect(panel.classList.contains("dc-panel-open")).toBe(false)
    )

    // min → compact — cycle wraps.
    await userEvent.click(sizeBtn)
    await waitFor(() => expect(root.dataset.size).toBe("compact"))
  },
}

/** Selecting an emotion in the capture panel emits `onMoodSelect` with the mood. */
export const MoodSelectEmitsEvent: Story = {
  play: async ({ canvasElement, args }) => {
    const wrap = await find(canvasElement, ".dc-circle-wrap")

    // Open the capture panel, then pick "Joy".
    await userEvent.click(wrap)
    const joyBtn = await find<HTMLButtonElement>(
      canvasElement,
      '.dc-emo-btn[title="Joy"]'
    )
    await waitFor(() => expect(joyBtn).toBeVisible())
    await userEvent.click(joyBtn)

    await waitFor(() => expect(args.onMoodSelect).toHaveBeenCalledWith("joy"))
    await waitFor(() =>
      expect(joyBtn.classList.contains("dc-emo-selected")).toBe(true)
    )
  },
}
