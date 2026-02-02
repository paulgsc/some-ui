export type RecordingState =
  | { type: "idle" }
  | { type: "requesting_permission" }
  | { type: "permission_denied"; error: string }
  | { type: "recording"; startTime: number }
  | { type: "paused"; startTime: number; elapsedBeforePause: number }
  | { type: "processing" }
  | { type: "success"; audioBlob: Blob; audioUrl: string; duration: number }
  | { type: "error"; error: string; canRetry: boolean }

export type RecordingAction =
  | { type: "START_RECORDING" }
  | { type: "PERMISSION_GRANTED"; stream: MediaStream }
  | { type: "PERMISSION_DENIED"; error: string }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP" }
  | {
      type: "RECORDING_COMPLETE"
      audioBlob: Blob
      audioUrl: string
      duration: number
    }
  | { type: "ERROR"; error: string; canRetry: boolean }
  | { type: "RESET" }
  | { type: "RETRY" }
