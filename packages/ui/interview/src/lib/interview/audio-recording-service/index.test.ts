import { afterEach, describe, expect, it, vi } from "vitest"

import { AudioRecordingService } from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function makeStream(): {
  stream: MediaStream
  stopTrack: ReturnType<typeof vi.fn>
} {
  const stopTrack = vi.fn()
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal fake, only getTracks() is exercised by the service
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream
  return { stream, stopTrack }
}

class FakeMediaRecorder {
  static supportedTypes = new Set<string>(["audio/webm;codecs=opus"])
  static instances: Array<FakeMediaRecorder> = []
  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supportedTypes.has(type)
  }

  state: "inactive" | "recording" | "paused" = "inactive"
  mimeType: string
  onstop: (() => void) | null = null

  constructor(
    public stream: MediaStream,
    options: { mimeType: string }
  ) {
    this.mimeType = options.mimeType
    FakeMediaRecorder.instances.push(this)
  }

  start(): void {
    this.state = "recording"
  }

  pause(): void {
    this.state = "paused"
  }

  resume(): void {
    this.state = "recording"
  }

  stop(): void {
    this.state = "inactive"
    this.onstop?.()
  }
}

function stubSecureContext(value: boolean): void {
  Object.defineProperty(window, "isSecureContext", {
    value,
    configurable: true,
  })
}

function stubGetUserMedia(impl: () => Promise<MediaStream>): void {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
  })
}

function stubMediaRecorder(): void {
  FakeMediaRecorder.instances = []
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder)
}

function latestRecorder(): FakeMediaRecorder {
  const recorder = FakeMediaRecorder.instances.at(-1)
  if (!recorder) throw new Error("no MediaRecorder was constructed")
  return recorder
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
// requestPermission - environment guards
// ═══════════════════════════════════════════════════════════════════════════

describe("AudioRecordingService.requestPermission - environment guards", () => {
  it("throws when the page is not a secure context", async () => {
    stubSecureContext(false)
    const service = new AudioRecordingService()
    await expect(service.requestPermission()).rejects.toThrow(/secure context/i)
  })

  it("throws when the browser has no getUserMedia support", async () => {
    stubSecureContext(true)
    Object.defineProperty(navigator, "mediaDevices", {
      value: {},
      configurable: true,
    })
    const service = new AudioRecordingService()
    await expect(service.requestPermission()).rejects.toThrow(
      /does not support audio recording/i
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// requestPermission - DOMException classification
// ═══════════════════════════════════════════════════════════════════════════

describe("AudioRecordingService.requestPermission - permission error classification", () => {
  it.each([
    ["NotAllowedError", /permission denied/i],
    ["NotFoundError", /no microphone found/i],
    ["NotReadableError", /already in use/i],
  ] as const)("maps %s to a friendly message", async (name, expected) => {
    stubSecureContext(true)
    stubGetUserMedia(() => Promise.reject(new DOMException("boom", name)))
    const service = new AudioRecordingService()
    await expect(service.requestPermission()).rejects.toThrow(expected)
  })

  it("falls back to a generic message for an unrecognized DOMException", async () => {
    stubSecureContext(true)
    stubGetUserMedia(() =>
      Promise.reject(new DOMException("boom", "SecurityError"))
    )
    const service = new AudioRecordingService()
    await expect(service.requestPermission()).rejects.toThrow(
      /failed to access microphone/i
    )
  })

  it("resolves with the stream on success", async () => {
    stubSecureContext(true)
    const { stream } = makeStream()
    stubGetUserMedia(() => Promise.resolve(stream))
    const service = new AudioRecordingService()
    await expect(service.requestPermission()).resolves.toBe(stream)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// startRecording - mime-type fallback order
// ═══════════════════════════════════════════════════════════════════════════

describe("AudioRecordingService.startRecording - mime-type fallback", () => {
  it("prefers audio/webm;codecs=opus when supported", () => {
    FakeMediaRecorder.supportedTypes = new Set([
      "audio/webm;codecs=opus",
      "audio/webm",
    ])
    stubMediaRecorder()
    const { stream } = makeStream()
    const service = new AudioRecordingService()

    service.startRecording(stream)

    expect(latestRecorder().mimeType).toBe("audio/webm;codecs=opus")
  })

  it("falls back to the next supported candidate in order", () => {
    FakeMediaRecorder.supportedTypes = new Set(["audio/ogg;codecs=opus"])
    stubMediaRecorder()
    const { stream } = makeStream()
    const service = new AudioRecordingService()

    service.startRecording(stream)

    expect(latestRecorder().mimeType).toBe("audio/ogg;codecs=opus")
  })

  it("throws when no candidate mime type is supported", () => {
    FakeMediaRecorder.supportedTypes = new Set()
    stubMediaRecorder()
    const { stream } = makeStream()
    const service = new AudioRecordingService()

    expect(() => service.startRecording(stream)).toThrow(
      /no supported audio format/i
    )
  })

  it("throws when MediaRecorder itself is unsupported", () => {
    vi.stubGlobal("MediaRecorder", undefined)
    const { stream } = makeStream()
    const service = new AudioRecordingService()

    expect(() => service.startRecording(stream)).toThrow(
      /mediarecorder is not supported/i
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// stop / cleanup
// ═══════════════════════════════════════════════════════════════════════════

describe("AudioRecordingService.stop", () => {
  it("resolves with a blob and object URL, then stops the stream's tracks", async () => {
    FakeMediaRecorder.supportedTypes = new Set(["audio/webm;codecs=opus"])
    stubMediaRecorder()
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fake-url") })
    const { stream, stopTrack } = makeStream()
    const service = new AudioRecordingService()
    service.startRecording(stream)

    const { blob, url } = await service.stop()

    expect(url).toBe("blob:fake-url")
    expect(blob).toBeInstanceOf(Blob)
    expect(stopTrack).toHaveBeenCalled()
  })

  it("rejects when there is no active recording", async () => {
    const service = new AudioRecordingService()
    await expect(service.stop()).rejects.toThrow(/no active recording/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pause / resume - state-gated delegation
// ═══════════════════════════════════════════════════════════════════════════

describe("AudioRecordingService.pause/resume", () => {
  it("only pauses an actively recording recorder", () => {
    FakeMediaRecorder.supportedTypes = new Set(["audio/webm;codecs=opus"])
    stubMediaRecorder()
    const { stream } = makeStream()
    const service = new AudioRecordingService()
    service.startRecording(stream)
    const pauseSpy = vi.spyOn(latestRecorder(), "pause")

    service.pause()
    expect(pauseSpy).toHaveBeenCalledTimes(1)

    service.pause() // already paused - no-op
    expect(pauseSpy).toHaveBeenCalledTimes(1)
  })

  it("only resumes a paused recorder", () => {
    FakeMediaRecorder.supportedTypes = new Set(["audio/webm;codecs=opus"])
    stubMediaRecorder()
    const { stream } = makeStream()
    const service = new AudioRecordingService()
    service.startRecording(stream)
    service.pause()
    const resumeSpy = vi.spyOn(latestRecorder(), "resume")

    service.resume()
    expect(resumeSpy).toHaveBeenCalledTimes(1)

    service.resume() // already recording - no-op
    expect(resumeSpy).toHaveBeenCalledTimes(1)
  })
})
