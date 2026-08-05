import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAudioRecorder } from "."

const {
  requestPermissionMock,
  startRecordingMock,
  stopMock,
  pauseMock,
  resumeMock,
  cleanupMock,
} = vi.hoisted(() => ({
  requestPermissionMock: vi.fn(),
  startRecordingMock: vi.fn(),
  stopMock: vi.fn(),
  pauseMock: vi.fn(),
  resumeMock: vi.fn(),
  cleanupMock: vi.fn(),
}))

vi.mock("@interview/lib/interview/audio-recording-service", () => ({
  // eslint-disable-next-line prefer-arrow-callback
  AudioRecordingService: vi.fn().mockImplementation(function () {
    return {
      requestPermission: requestPermissionMock,
      startRecording: startRecordingMock,
      stop: stopMock,
      pause: pauseMock,
      resume: resumeMock,
      cleanup: cleanupMock,
    }
  }),
}))

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function fakeStream(): MediaStream {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the hook only forwards this to state/the mocked service, never touches its members
  return {} as MediaStream
}

afterEach(() => {
  vi.clearAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
// notify-once guard (notifiedRef)
// ═══════════════════════════════════════════════════════════════════════════

describe("useAudioRecorder - notify-once guard", () => {
  it("calls onRecordingComplete exactly once per successful recording, even across re-renders", async () => {
    requestPermissionMock.mockResolvedValue(fakeStream())
    stopMock.mockResolvedValue({ blob: new Blob(), url: "blob:one" })
    const onRecordingComplete = vi.fn()

    const { result, rerender } = renderHook(() =>
      useAudioRecorder(onRecordingComplete)
    )

    await act(async () => {
      await result.current.startRecording()
    })
    expect(result.current.state.type).toBe("recording")

    await act(async () => {
      await result.current.stopRecording()
    })
    expect(result.current.state.type).toBe("success")
    expect(onRecordingComplete).toHaveBeenCalledTimes(1)
    expect(onRecordingComplete).toHaveBeenCalledWith(
      expect.any(Blob),
      "blob:one",
      expect.any(Number)
    )

    rerender()
    rerender()
    rerender()
    expect(onRecordingComplete).toHaveBeenCalledTimes(1)
  })

  it("re-arms the guard after reset, notifying again for the next recording", async () => {
    requestPermissionMock.mockResolvedValue(fakeStream())
    stopMock
      .mockResolvedValueOnce({ blob: new Blob(), url: "blob:one" })
      .mockResolvedValueOnce({ blob: new Blob(), url: "blob:two" })
    const onRecordingComplete = vi.fn()

    const { result } = renderHook(() => useAudioRecorder(onRecordingComplete))

    await act(async () => {
      await result.current.startRecording()
    })
    await act(async () => {
      await result.current.stopRecording()
    })
    expect(onRecordingComplete).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.reset()
    })
    expect(result.current.state.type).toBe("idle")

    await act(async () => {
      await result.current.startRecording()
    })
    await act(async () => {
      await result.current.stopRecording()
    })

    expect(onRecordingComplete).toHaveBeenCalledTimes(2)
    expect(onRecordingComplete).toHaveBeenLastCalledWith(
      expect.any(Blob),
      "blob:two",
      expect.any(Number)
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// permission-denied path
// ═══════════════════════════════════════════════════════════════════════════

describe("useAudioRecorder - permission denied", () => {
  it("moves to permission_denied and never notifies onRecordingComplete", async () => {
    requestPermissionMock.mockRejectedValue(
      new Error("Microphone permission denied.")
    )
    const onRecordingComplete = vi.fn()

    const { result } = renderHook(() => useAudioRecorder(onRecordingComplete))

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.state.type).toBe("permission_denied")
    expect(startRecordingMock).not.toHaveBeenCalled()
    expect(onRecordingComplete).not.toHaveBeenCalled()
  })
})
