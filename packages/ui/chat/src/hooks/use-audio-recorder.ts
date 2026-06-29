import { useEffect, useReducer, useRef, useState } from "react"
import { AudioRecordingService } from "@chat/lib/interview/audio-recording-service"
import { recordingReducer } from "@chat/lib/interview/recording-reducer"
import { mockUploadAudio } from "@chat/lib/interview/upload-service"
import type { RecordingState } from "@chat/types/interview"

type UseAudioRecorderReturn = {
  state: RecordingState
  elapsedTime: number
  startRecording: () => Promise<void>
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: () => Promise<void>
  reset: () => void
  retry: () => void
}

export const useAudioRecorder = (
  onComplete: (transcript: string) => void
): UseAudioRecorderReturn => {
  const [state, dispatch] = useReducer(recordingReducer, { type: "idle" })
  const serviceRef = useRef<AudioRecordingService | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initialize service
  useEffect(() => {
    serviceRef.current = new AudioRecordingService()
  }, [])

  // Timer effect
  useEffect(() => {
    if (state.type === "recording") {
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - state.startTime) / 1000))
      }, 100)
    } else if (state.type === "paused") {
      setElapsedTime(state.elapsedBeforePause)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (state.type === "idle" || state.type === "requesting_permission") {
        setElapsedTime(0)
      }
    }

    return (): void => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [state])

  // Handle success state - upload and complete
  useEffect(() => {
    if (state.type === "success") {
      const uploadAndComplete = async (): Promise<void> => {
        try {
          await mockUploadAudio(state.audioBlob)

          // Mock transcription
          setTimeout(() => {
            const mockTranscript = `I would design a URL shortening service with the following approach: First, I'd use a hash function to generate short codes from long URLs. The system would need a database to store mappings between short codes and original URLs. For scalability, I would implement caching using Redis and use a load balancer to distribute traffic.`
            onComplete(mockTranscript)
          }, 1000)
        } catch (error) {
          dispatch({
            type: "ERROR",
            error: error instanceof Error ? error.message : "Upload failed",
            canRetry: true,
          })
        }
      }

      void uploadAndComplete()
    }
  }, [state, onComplete])

  const startRecording = async (): Promise<void> => {
    dispatch({ type: "START_RECORDING" })
    try {
      const stream = await serviceRef.current!.requestPermission()
      dispatch({ type: "PERMISSION_GRANTED", stream })
      serviceRef.current!.startRecording(stream)
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
    } catch (error) {
      dispatch({
        type: "ERROR",
        error:
          error instanceof Error ? error.message : "Failed to stop recording",
        canRetry: false,
      })
    }
  }

  const reset = (): void => {
    serviceRef.current?.cleanup()
    dispatch({ type: "RESET" })
  }

  const retry = (): void => {
    dispatch({ type: "RETRY" })
  }

  return {
    state,
    elapsedTime,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset,
    retry,
  }
}
