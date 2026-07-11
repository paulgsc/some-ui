import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAudioPlayback } from "./use-audio-playback"

describe("useAudioPlayback", () => {
  let audio: HTMLAudioElement

  beforeEach(() => {
    audio = document.createElement("audio")
    vi.spyOn(audio, "play").mockResolvedValue(undefined)
    vi.spyOn(audio, "pause").mockImplementation(() => undefined)
  })

  it("starts paused and ignores toggles when there is no audio element", () => {
    const { result } = renderHook(() => useAudioPlayback(null, null))

    expect(result.current.isPlaying).toBe(false)

    act(() => {
      result.current.togglePlay()
    })

    expect(result.current.isPlaying).toBe(false)
  })

  it("plays on the first toggle and pauses on the second", () => {
    const { result } = renderHook(() => useAudioPlayback(audio, null))

    act(() => {
      result.current.togglePlay()
    })
    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(result.current.isPlaying).toBe(true)

    act(() => {
      result.current.togglePlay()
    })
    expect(audio.pause).toHaveBeenCalledTimes(1)
    expect(result.current.isPlaying).toBe(false)
  })

  it("syncs isPlaying back to false when the element fires 'ended'", () => {
    const { result } = renderHook(() => useAudioPlayback(audio, null))

    act(() => {
      result.current.togglePlay()
    })
    expect(result.current.isPlaying).toBe(true)

    act(() => {
      audio.dispatchEvent(new Event("ended"))
    })
    expect(result.current.isPlaying).toBe(false)
  })

  it("removes the 'ended' listener on unmount", () => {
    const removeSpy = vi.spyOn(audio, "removeEventListener")
    const { unmount } = renderHook(() => useAudioPlayback(audio, null))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith("ended", expect.any(Function))
  })
})
