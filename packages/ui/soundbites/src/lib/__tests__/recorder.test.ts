import { RecordingError, startMicRecording } from "@soundbites/lib/recorder"
import { afterEach, describe, expect, it, vi } from "vitest"

/** A microphone stream whose one track records whether it was stopped. */
function fakeStream(): {
  stream: { getTracks: () => Array<{ stop: () => void }> }
  stop: ReturnType<typeof vi.fn>
} {
  const stop = vi.fn()
  return { stream: { getTracks: () => [{ stop }] }, stop }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("startMicRecording", () => {
  it("lets go of the microphone when the recorder will not start", async () => {
    const { stream, stop } = fakeStream()
    vi.stubGlobal("isSecureContext", true)
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => Promise.resolve(stream) },
    })
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported = (): boolean => true
        state = "inactive"
        mimeType = "audio/webm"
        start(): void {
          throw new DOMException("no", "InvalidStateError")
        }
      }
    )

    const started = startMicRecording()

    await expect(started).rejects.toBeInstanceOf(RecordingError)
    await expect(started).rejects.toMatchObject({ reason: "failed" })
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
