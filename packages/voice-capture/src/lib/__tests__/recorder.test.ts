import { addFailureSink } from "@some-ui/intent-kit"
import { micRecorder, RecordingError } from "@voice-capture/lib/recorder"
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

describe("micRecorder", () => {
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

    const started = micRecorder({ bitsPerSecond: 32_000 })()

    await expect(started).rejects.toBeInstanceOf(RecordingError)
    await expect(started).rejects.toMatchObject({ reason: "failed" })
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it("reports a refused microphone, then says why", async () => {
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined)
    const reported = vi.fn()
    const remove = addFailureSink(reported)
    vi.stubGlobal("isSecureContext", true)
    vi.stubGlobal("MediaRecorder", class {})
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: (): Promise<never> =>
          Promise.reject(new DOMException("no", "NotAllowedError")),
      },
    })

    await expect(
      micRecorder({ bitsPerSecond: 32_000 })()
    ).rejects.toMatchObject({ reason: "denied" })
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({
        port: expect.stringContaining("microphone"),
        error: expect.objectContaining({ kind: "rejected" }),
      })
    )
    remove()
    vi.restoreAllMocks()
  })
})
