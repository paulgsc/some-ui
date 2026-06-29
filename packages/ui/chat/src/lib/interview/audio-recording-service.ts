export class AudioRecordingService {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Array<Blob> = []
  private stream: MediaStream | null = null

  async requestPermission(): Promise<MediaStream> {
    // Secure context is a hard requirement — no JS workaround
    if (!window.isSecureContext) {
      throw new Error(
        "Audio recording requires a secure context (HTTPS or localhost)."
      )
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })

      this.stream = stream
      return stream
    } catch (error) {
      if (error instanceof DOMException) {
        switch (error.name) {
          case "NotAllowedError":
            throw new Error(
              "Microphone permission denied. Please enable access in your browser.",
              { cause: error }
            )
          case "NotFoundError":
            throw new Error(
              "No microphone found. Please connect a microphone and try again.",
              { cause: error }
            )
          case "NotReadableError":
            throw new Error(
              "Microphone is already in use by another application.",
              { cause: error }
            )
        }
      }

      throw new Error("Failed to access microphone.", { cause: error })
    }
  }

  startRecording(stream: MediaStream): void {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not supported in this browser.")
    }

    const mimeType = this.getSupportedMimeType()
    if (!mimeType) {
      throw new Error("No supported audio format available for recording.")
    }

    this.audioChunks = []
    this.stream = stream

    try {
      const recorder = new MediaRecorder(stream, { mimeType })
      this.mediaRecorder = recorder

      recorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      recorder.start(100)
    } catch (error) {
      throw new Error("Failed to start audio recording.", { cause: error })
    }
  }

  pause(): void {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.pause()
    }
  }

  resume(): void {
    if (this.mediaRecorder?.state === "paused") {
      this.mediaRecorder.resume()
    }
  }

  stop(): Promise<{ blob: Blob; url: string }> {
    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder
      if (!recorder) {
        reject(new Error("No active recording."))
        return
      }

      recorder.onstop = (): void => {
        try {
          const blob = new Blob(this.audioChunks, {
            type: recorder.mimeType,
          })
          const url = URL.createObjectURL(blob)
          this.cleanup()
          resolve({ blob, url })
        } catch (error) {
          reject(new Error("Failed to finalize recording.", { cause: error }))
        }
      }

      recorder.stop()
    })
  }

  cleanup(): void {
    this.mediaRecorder = null
    this.audioChunks = []

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
  }

  private getSupportedMimeType(): string | null {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ]

    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    return null
  }
}
