import "@drama/styles/content.css"

import { useEffect, useRef } from "react"
import { cardState } from "@drama/components/__fixtures__/card-state"
import { Slideshow } from "@drama/components/slideshow"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor } from "@storybook/test"

// ── Interaction bridge ────────────────────────────────────────────────────────
// Mounts a bare Slideshow and pins its *behaviour* with play functions, isolated
// from the card shell. Mirrors the wiring DramaCard applies so the pinned
// behaviour matches what ships:
//   • auto-advance walks the slides on an interval;
//   • a click on the circle stops the timer, advances one slide, and (when
//     auto-advancing) restarts it — i.e. a manual advance resets the timer.
//
// @storybook/test exposes no fake-timer control, so auto-advance is pinned with
// a deliberately short interval polled by `waitFor` — deterministic, not a raw
// real-time sleep.

type BridgeProps = {
  autoAdvance: boolean
  intervalMs: number
}

const FIXTURE = cardState({ tags: ["handTouch", "reveal"] })

const InteractiveSlideshow = ({ autoAdvance, intervalMs }: BridgeProps) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const ssRef = useRef<Slideshow | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || ssRef.current) return

    // A #dc-root ancestor scopes the size/slide selectors. The shipped
    // #dc-root rule parks the card off-screen (left/top: -9999px) until JS
    // positions it, so pin it back on-screen for the isolated harness.
    const root = document.createElement("div")
    root.id = "dc-root"
    root.dataset.size = "full"
    root.style.cssText =
      "position:relative; display:inline-block; left:0; top:0;"

    const ss = new Slideshow()
    Object.assign(ss.wrap.style, { width: "120px", height: "120px" })

    ss.onSlideClick = (): void => {
      ss.stopAutoAdvance()
      ss.setSlide((ss.current + 1) % ss.slideCount)
      if (autoAdvance) ss.startAutoAdvance(intervalMs)
    }

    const s = FIXTURE
    ss.applyAxesState(s.axes)
    ss.applyTransitionState(s.transition)
    ss.applyPosterState(s)
    ss.applyTagsState(s.tags, s.peakLine)
    ss.applyMomentumState(s.momentum)
    ss.applyAtmosphereState(s.axes)
    ss.applyRatingState(s.rating)
    ss.applySummaryState(s)
    ss.setSlide(0)

    root.appendChild(ss.wrap)
    host.appendChild(root)
    ssRef.current = ss

    if (autoAdvance) ss.startAutoAdvance(intervalMs)

    return () => {
      ss.destroy()
      ssRef.current = null
      root.remove()
    }
  }, [autoAdvance, intervalMs])

  return (
    <div
      ref={hostRef}
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, hsl(220 30% 14%), hsl(240 25% 8%))",
      }}
    />
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const activeSlideIndex = (canvasElement: HTMLElement): number =>
  Array.from(canvasElement.querySelectorAll(".dc-slide")).findIndex((s) =>
    s.classList.contains("dc-slide-active")
  )

// ── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<BridgeProps> = {
  title: "Extensions/Drama/Components/Slideshow/Interactions",
  component: InteractiveSlideshow,
  parameters: { layout: "fullscreen" },
  tags: ["!autodocs"],
}

export default meta
type Story = StoryObj<BridgeProps>

// ── Stories ──────────────────────────────────────────────────────────────────

/** Auto-advance walks forward through the slides on its interval. */
export const AutoAdvanceCycles: Story = {
  args: { autoAdvance: true, intervalMs: 60 },
  play: async ({ canvasElement }) => {
    // Starts on slide 0; several ticks should carry it well past the first.
    await waitFor(
      () => expect(activeSlideIndex(canvasElement)).toBeGreaterThanOrEqual(2),
      { timeout: 3000 }
    )
  },
}

/** Clicking the circle advances exactly one slide (auto-advance off). */
export const ClickAdvancesSlide: Story = {
  args: { autoAdvance: false, intervalMs: 5000 },
  play: async ({ canvasElement }) => {
    const wrap = await waitFor((): HTMLElement => {
      const w = canvasElement.querySelector<HTMLElement>(".dc-circle-wrap")
      if (!w) throw new Error(".dc-circle-wrap not found")
      return w
    })
    await waitFor(() => expect(activeSlideIndex(canvasElement)).toBe(0))
    await userEvent.click(wrap)
    await waitFor(() => expect(activeSlideIndex(canvasElement)).toBe(1))
    await userEvent.click(wrap)
    await waitFor(() => expect(activeSlideIndex(canvasElement)).toBe(2))
  },
}
