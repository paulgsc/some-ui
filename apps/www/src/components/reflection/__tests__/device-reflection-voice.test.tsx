/**
 * @vitest-environment jsdom
 *
 * Spoken reflections on the take pattern's parts, over the phone's takes
 * with the shared simulated microphone.
 */

import { takeButton } from "@some-ui/voice-capture/testing"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { testReflections } from "@/lib/reflection-voice/__tests__/takes"
import { ReflectionTakeList } from "@/components/reflection/device-reflection-voice"

const pass = (ms = 0): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

async function record(ms: number): Promise<void> {
  fireEvent.click(takeButton())
  await pass(ms)
  expect(takeButton().getAttribute("data-take")).toBe("recording")
  fireEvent.click(takeButton())
  await pass()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("ReflectionTakeList", () => {
  it("records by tap, says where it is kept, plays it, redoes it and sets it aside, keeping every take", async () => {
    const phone = testReflections("s1")
    render(
      <ReflectionTakeList voice={phone.voice} sessionId="s1" atMs={60_000} />
    )
    await record(3_000)
    expect(screen.getByText("Kept.")).toBeTruthy()
    expect(screen.getByText(/Kept on this phone/)).toBeTruthy()
    expect(phone.kept()).toMatchObject([{ sessionId: "s1", atMs: 60_000 }])

    fireEvent.click(screen.getByRole("button", { name: /^Play the take/ }))
    await pass()
    expect(phone.player.playing()).toBe(1)

    fireEvent.click(screen.getByRole("button", { name: /^Redo the take/ }))
    await pass(2_000)
    fireEvent.click(takeButton())
    await pass()
    expect(screen.getByText("Earlier take (1)")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /^Let it go the take/ }))
    expect(screen.getByText("Set aside. It stays on this phone.")).toBeTruthy()
    expect(
      screen.queryAllByRole("button", { name: /^Redo the take/ })
    ).toHaveLength(0)
    expect(phone.kept()).toHaveLength(2)
    expect(await phone.audio.ids()).toHaveLength(2)
  })
})
