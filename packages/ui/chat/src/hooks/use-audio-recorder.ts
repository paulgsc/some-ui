import { useEffect, useReducer, useRef, useState } from "react"
import { AudioRecordingService } from "@chat/lib/interview/audio-recording-service"
import { recordingReducer } from "@chat/lib/interview/recording-reducer"
import type { RecordingState } from "@chat/types/interview"

export type UseAudioRecorderReturn = {
  state: RecordingState
  elapsedTime: number
  /** Live mic stream while recording/paused - null otherwise. Exposed so
   * the UI can drive a real audio-level visualization. */
  stream: MediaStream | null
  startRecording: () => Promise<void>
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: () => Promise<void>
  reset: () => void
  retry: () => void
}

/**
 * Owns microphone capture only - permission, start/pause/stop, elapsed
 * time. What happens to the finished recording (upload, transcription)
 * is the caller's concern, kept out of this hook so it stays reusable
 * outside the interview flow.
 */
export const useAudioRecorder = (
  onRecordingComplete: (blob: Blob, audioUrl: string, durationSeconds: number) => void
): UseAudioRecorderReturn => {
  const [state, dispatch] = useReducer(recordingReducer, { type: "idle" })
  const serviceRef = useRef<AudioRecordingService | null>(null)
  const [liveElapsed, setLiveElapsed] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initialize service
  useEffect(() => {
    serviceRef.current = new AudioRecordingService()
  }, [])

  // Tick a live counter only while actively recording; every other phase's
  // elapsed time is derived below instead of mirrored into state here.
  useEffect(() => {
    if (state.type !== "recording") return

    const { startTime } = state
    timerRef.current = setInterval(() => {
      setLiveElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 100)

    return (): void => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state])

  const elapsedTime =
    state.type === "recording"
      ? liveElapsed
      : state.type === "paused"
        ? state.elapsedBeforePause
        : 0

  // Hand the finished recording off to the caller exactly once per success
  const notifiedRef = useRef(false)
  useEffect(() => {
    if (state.type !== "success") {
      notifiedRef.current = false
      return
    }
    if (notifiedRef.current) return
    notifiedRef.current = true
    onRecordingComplete(state.audioBlob, state.audioUrl, state.duration)
  }, [state, onRecordingComplete])

  const startRecording = async (): Promise<void> => {
    dispatch({ type: "START_RECORDING" })
    try {
      const micStream = await serviceRef.current!.requestPermission()
      dispatch({ type: "PERMISSION_GRANTED", stream: micStream })
      serviceRef.current!.startRecording(micStream)
      setStream(micStream)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error)
      dispatch({
        type: "PERMISSION_DENIED",
        error: error instanceof Error ? error.message : "Permission denied",
      })
    }
  }

  const pauseRecording = (): void => {
    serviceRef.current?.pause()
    dispatch({ type: "PAUSE" })
  }

  const resumeRecording = (): void => {
    serviceRef.current?.resume()
    dispatch({ type: "RESUME" })
  }

  const stopRecording = async (): Promise<void> => {
    dispatch({ type: "STOP" })

    try {
      const { blob, url } = await serviceRef.current!.stop()
      dispatch({
        type: "RECORDING_COMPLETE",
        audioBlob: blob,
        audioUrl: url,
        duration: elapsedTime,
      })
      setStream(null)
    } catch (error) {
      dispatch({
        type: "ERROR",
        error:
          error instanceof Error ? error.message : "Failed to stop recording",
        canRetry: false,
      })
      setStream(null)
    }
  }

  const reset = (): void => {
    serviceRef.current?.cleanup()
    setStream(null)
    dispatch({ type: "RESET" })
  }

  const retry = (): void => {
    dispatch({ type: "RETRY" })
  }

  return {
    state,
    elapsedTime,
    stream,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset,
    retry,
  }
}
