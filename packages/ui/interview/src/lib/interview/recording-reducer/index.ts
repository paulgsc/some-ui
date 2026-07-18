import type {
  RecordingAction,
  RecordingState,
} from "@interview/types/interview"

export const recordingReducer = (
  state: RecordingState,
  action: RecordingAction
): RecordingState => {
  const match = <T extends RecordingState["type"]>(
    type: T,
    handler: (state: Extract<RecordingState, { type: T }>) => RecordingState
  ): RecordingState | null => {
    return state.type === type
      ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Safe: state.type was checked immediately above; TS cannot narrow generic discriminants here.
        handler(state as Extract<RecordingState, { type: T }>)
      : null
  }

  switch (action.type) {
    case "START_RECORDING": {
      return (
        match("idle", () => ({ type: "requesting_permission" })) ??
        match("error", () => ({ type: "requesting_permission" })) ??
        match("permission_denied", () => ({ type: "requesting_permission" })) ??
        state
      )
    }

    case "PERMISSION_GRANTED": {
      return (
        match("requesting_permission", () => ({
          type: "recording",
          startTime: Date.now(),
        })) ?? state
      )
    }

    case "PERMISSION_DENIED": {
      return (
        match("requesting_permission", () => ({
          type: "permission_denied",
          error: action.error,
        })) ?? state
      )
    }

    case "PAUSE": {
      return (
        match("recording", (s) => ({
          type: "paused",
          startTime: s.startTime,
          elapsedBeforePause: Math.floor((Date.now() - s.startTime) / 1000),
        })) ?? state
      )
    }

    case "RESUME": {
      return (
        match("paused", (s) => ({
          type: "recording",
          startTime: Date.now() - s.elapsedBeforePause * 1000,
        })) ?? state
      )
    }

    case "STOP": {
      return (
        match("recording", () => ({ type: "processing" })) ??
        match("paused", () => ({ type: "processing" })) ??
        state
      )
    }

    case "RECORDING_COMPLETE": {
      return (
        match("processing", () => ({
          type: "success",
          audioBlob: action.audioBlob,
          audioUrl: action.audioUrl,
          duration: action.duration,
        })) ?? state
      )
    }

    case "ERROR": {
      return { type: "error", error: action.error, canRetry: action.canRetry }
    }

    case "RESET": {
      return { type: "idle" }
    }

    case "RETRY": {
      return (
        match("error", () => ({ type: "idle" })) ??
        match("permission_denied", () => ({ type: "idle" })) ??
        state
      )
    }

    // eslint-disable-next-line switch-lint/require-fail-fast-default -- reducer intentionally ignores actions irrelevant to the current recording state and returns state unchanged
    default: {
      return state
    }
  }
}
