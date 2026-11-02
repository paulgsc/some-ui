/**
 * @vitest-environment jsdom
 *
 * A form's voice notes on the take pattern's parts, over the phone's Jobs
 * runtime with the shared simulated microphone and player.
 */

import type { SimulatedPlayer } from "@some-ui/voice-capture/testing"
import { takeButton } from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const player: { current?: SimulatedPlayer } = vi.hoisted(() => ({}))

vi.mock("@/lib/jobs", async () => {
  const { createJobsRuntime } = await import("@/lib/jobs/runtime")
  const { ports } = await import("@/lib/jobs/__tests__/fixture")
  const testing = await import("@some-ui/voice-capture/testing")
  player.current = testing.simulatedPlayer()
  const runtime = createJobsRuntime(
    ports({ player: player.current, now: () => new Date(Date.now()) })
  )
  return { phoneJobs: (): typeof runtime => runtime }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const pass = (ms = 0): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

describe("VoiceNotes", () => {
  it("stops its note playing when the form goes as it is recorded", async () => {
    vi.useFakeTimers()
    const { phoneJobs } = await import("@/lib/jobs")
    const { SCOUT_OWNER } = await import("@/lib/jobs/model")
    const { VoiceNotes } = await import("@/components/jobs/parts")
    const { unmount } = render(
      <VoiceNotes owner={SCOUT_OWNER} hint="Or say why" />
    )
    fireEvent.click(takeButton())
    await pass(3_000)
    fireEvent.click(takeButton())
    await pass()
    fireEvent.click(screen.getByRole("button", { name: /^Play the take/ }))
    await pass()
    expect(player.current?.playing()).toBe(1)
    // "Add to my scouts" names the note, then the form goes.
    const jobs = phoneJobs()
    const ids = jobs.getSnapshot().state.voice.map(({ id }) => id)
    act(() => {
      jobs.addScout(
        {
          url: "https://www.indeed.com/viewjob?jk=1",
          track: "software",
          family: null,
          title: "SRE · Acme",
          why: "Pagers",
          postingText: null,
        },
        ids
      )
    })
    unmount()
    expect(player.current?.playing()).toBe(0)
  })
})
