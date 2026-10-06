import { StrictMode } from "react"
import { useGameAudio } from "@honeycomb/hooks/use-game-audio"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
})

describe("useGameAudio", () => {
  // StrictMode's mount -> cleanup -> remount must leave the Audio map
  // rebuilt, not cleared for good.
  it("still finds every event's audio after StrictMode's mount/cleanup/remount replay", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { result } = renderHook(() => useGameAudio(), { wrapper: StrictMode })

    act(() => {
      result.current.playSound("character_spawn")
    })

    expect(logSpy).not.toHaveBeenCalledWith(
      "no audio found for event: ",
      "character_spawn"
    )
  })

  it("plays the mapped sound for an event when enabled", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play")

    const { result } = renderHook(() => useGameAudio({ enabled: true }))

    act(() => {
      result.current.playSound("match_correct")
    })

    expect(playSpy).toHaveBeenCalled()
  })

  it("does nothing when disabled", () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play")

    const { result } = renderHook(() => useGameAudio({ enabled: false }))

    act(() => {
      result.current.playSound("match_correct")
    })

    expect(playSpy).not.toHaveBeenCalled()
  })

  it("keeps the same audio map populated across a volume-only re-render", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { result, rerender } = renderHook(
      ({ volume }: { volume: number }) => useGameAudio({ volume }),
      { initialProps: { volume: 0.5 } }
    )

    rerender({ volume: 0.9 })

    act(() => {
      result.current.playSound("match_correct")
    })

    expect(logSpy).not.toHaveBeenCalledWith(
      "no audio found for event: ",
      "match_correct"
    )
  })
})
