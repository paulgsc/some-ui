export class AudioRecordingService {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Array<Blob> = []
  private stream: MediaStream | null = null

  async requestPermission(): Promise<MediaStream> {
    try {
      // Check if browser supports mediaDevices API
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Check if we're in an insecure context
        const isLocalhost =
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          window.location.hostname === "[::1]"
        const isSecure = window.location.protocol === "https:" || isLocalhost

        let errorMessage = "Your browser doesn't support audio recording. "

        if (!isSecure) {
          errorMessage += "Audio recording requires HTTPS (or localhost). "
        }

        // Check if we're in an iframe (common in Storybook)
        if (window !== window.top) {
          errorMessage +=
            "This feature may not work in an iframe/Storybook. Try opening in a new window or running your app directly. "
        }

        errorMessage +=
          "Please use a modern browser like Chrome, Firefox, or Safari."

        throw new Error(errorMessage)
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })
      return stream
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          throw new Error(
            "Microphone permission denied. Please enable microphone access in your browser settings.",
            { cause: error }
          )
        }
        if (error.name === "NotFoundError") {
          throw new Error(
            "No microphone found. Please connect a microphone and try again.",
            { cause: error }
          )
        }
        if (error.name === "NotSupportedError" || error.name === "TypeError") {
          throw new Error(
            "Audio recording is not supported. Please ensure you're using HTTPS (or localhost) and a modern browser.",
            { cause: error }
          )
        }
      }

      // Handle the case where error is already our custom error
      if (
        error instanceof Error &&
        error.message.includes("doesn't support audio recording")
      ) {
        throw error
      }

      throw new Error(
        "Failed to access microphone. Please check your browser permissions and ensure you're on HTTPS or localhost.",
        { cause: error }
      )
    }
  }

  startRecording(stream: MediaStream): void {
    this.stream = stream
    this.audioChunks = []

    try {
      // Check if MediaRecorder is supported
      if (typeof MediaRecorder === "undefined") {
        throw new Error(
          "MediaRecorder is not supported in your browser. Please use a modern browser."
        )
      }

      const mimeType = this.getSupportedMimeType()

      if (!mimeType) {
        throw new Error(
          "No supported audio format found. Please use a modern browser like Chrome, Firefox, or Safari."
        )
      }

      this.mediaRecorder = new MediaRecorder(stream, { mimeType })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.start(100) // Collect data every 100ms
    } catch (error) {
      // Re-throw our custom errors
      if (error instanceof Error && error.message.includes("not supported")) {
        throw error
      }

      throw new Error(
        "Failed to start recording. Your browser may not support audio recording.",
        { cause: error }
      )
    }
  }

  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause()
    }
  }

  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume()
    }
  }

  async stop(): Promise<{ blob: Blob; url: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("No active recording"))
        return
      }

      this.mediaRecorder.onstop = () => {
        try {
          const blob = new Blob(this.audioChunks, {
            type: this.mediaRecorder!.mimeType,
          })
          const url = URL.createObjectURL(blob)
          this.cleanup()
          resolve({ blob, url })
        } catch (error) {
          reject(new Error("Failed to process recording"))
        }
      }

      this.mediaRecorder.stop()
    })
  }

  cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    this.mediaRecorder = null
    this.audioChunks = []
  }

  private getSupportedMimeType(): string {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    return ""
  }
}
