import { useEffect, useMemo } from "react"
import { AudioPlayer } from "@interview/components/mock-interview/audio-player"
import { useAudioLevel } from "@interview/hooks/use-audio-level"
import type { UseAudioRecorderReturn } from "@interview/hooks/use-audio-recorder"
import { formatTime } from "@interview/lib/interview/format-time"
import { AlertCircle, Loader2, Mic, RotateCcw, Square } from "lucide-react"

type RecordingPhaseProps = {
  question: string
  recording: UseAudioRecorderReturn
}

export const RecordingPhase = ({
  question,
  recording,
}: RecordingPhaseProps): React.JSX.Element => {
  const {
    state,
    elapsedTime,
    stream,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset,
    retry,
  } = recording

  const levels = useAudioLevel(stream)
  const levelBarKeys = useMemo(
    () => Array.from({ length: levels.length }, (_, i) => `level-bar-${i}`),
    [levels.length]
  )

  // Space bar toggles start/stop so practicing doesn't require reaching for the mouse
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "Space") return
      if (
        e.target instanceof HTMLElement &&
        ["TEXTAREA", "INPUT"].includes(e.target.tagName)
      ) {
        return
      }

      if (state.type === "idle" || state.type === "error") {
        e.preventDefault()
        void startRecording()
      } else if (state.type === "recording") {
        e.preventDefault()
        void stopRecording()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return (): void => window.removeEventListener("keydown", onKeyDown)
  }, [state.type, startRecording, stopRecording])

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background">
      <div className="max-w-3xl w-full space-y-6">
        <div className="p-8 md:p-12 space-y-8 bg-card border border-border rounded-lg shadow-sm">
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-medium text-foreground">
                The question
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                {question}
              </p>
            </div>

            {/* State-based rendering */}
            <div
              className="flex flex-col items-center justify-center space-y-8 py-8"
              aria-live="polite"
            >
              {/* Idle State */}
              {state.type === "idle" && (
                <>
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mic className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <button
                    onClick={startRecording}
                    className="gap-2 px-12 py-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors font-medium"
                  >
                    <Mic className="w-4 h-4 inline mr-2" />
                    Start speaking
                  </button>
                  <p className="text-center text-sm text-muted-foreground">
                    Click to begin recording your answer, or press space
                  </p>
                </>
              )}

              {/* Requesting Permission */}
              {state.type === "requesting_permission" && (
                <>
                  <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Requesting microphone access...
                  </p>
                </>
              )}

              {/* Permission Denied */}
              {state.type === "permission_denied" && (
                <>
                  <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-10 h-10 text-destructive" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      Microphone Access Denied
                    </p>
                    <p className="text-sm text-muted-foreground max-w-md">
                      {state.error}
                    </p>
                  </div>
                  <button
                    onClick={retry}
                    className="gap-2 px-8 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4 inline mr-2" />
                    Try again
                  </button>
                </>
              )}

              {/* Recording */}
              {state.type === "recording" && (
                <>
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                      <div className="w-20 h-20 rounded-full bg-primary/30 flex items-center justify-center">
                        <Mic className="w-10 h-10 text-primary" />
                      </div>
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                    <div
                      className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping"
                      style={{ animationDelay: "0.5s" }}
                    />
                  </div>

                  <p className="text-2xl font-mono text-foreground">
                    {formatTime(elapsedTime)}
                  </p>

                  <div
                    className="flex items-center gap-1 h-10 justify-center w-full max-w-md"
                    aria-hidden="true"
                  >
                    {levels.map((level, i) => (
                      <div
                        key={levelBarKeys[i]}
                        className="w-1 bg-primary/50 rounded-full transition-[height] duration-75"
                        style={{ height: `${Math.round(level * 100)}%` }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={pauseRecording}
                      className="px-8 py-2 bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/80 transition-colors"
                    >
                      Pause
                    </button>
                    <button
                      onClick={stopRecording}
                      className="gap-2 px-8 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
                    >
                      <Square className="w-4 h-4 inline mr-2" />
                      Finish
                    </button>
                    <button
                      onClick={reset}
                      className="gap-2 px-6 py-2 border border-border rounded-full hover:bg-accent transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 inline" />
                    </button>
                  </div>
                </>
              )}

              {/* Paused */}
              {state.type === "paused" && (
                <>
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-primary/30 flex items-center justify-center">
                        <Mic className="w-10 h-10 text-primary" />
                      </div>
                    </div>
                  </div>

                  <p className="text-2xl font-mono text-muted-foreground">
                    {formatTime(elapsedTime)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Recording paused
                  </p>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={resumeRecording}
                      className="px-8 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
                    >
                      Resume
                    </button>
                    <button
                      onClick={stopRecording}
                      className="gap-2 px-8 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
                    >
                      <Square className="w-4 h-4 inline mr-2" />
                      Finish
                    </button>
                    <button
                      onClick={reset}
                      className="gap-2 px-6 py-2 border border-border rounded-full hover:bg-accent transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 inline" />
                    </button>
                  </div>
                </>
              )}

              {/* Processing */}
              {state.type === "processing" && (
                <>
                  <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Processing recording...
                  </p>
                </>
              )}

              {/* Success */}
              {state.type === "success" && (
                <div className="w-full space-y-4">
                  <AudioPlayer url={state.audioUrl} />
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending for transcription...</span>
                  </div>
                </div>
              )}

              {/* Error */}
              {state.type === "error" && (
                <>
                  <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-10 h-10 text-destructive" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      Recording Error
                    </p>
                    <p className="text-sm text-muted-foreground max-w-md">
                      {state.error}
                    </p>
                  </div>
                  <div className="flex gap-4">
                    {state.canRetry && (
                      <button
                        onClick={retry}
                        className="gap-2 px-8 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4 inline mr-2" />
                        Try again
                      </button>
                    )}
                    <button
                      onClick={reset}
                      className="px-8 py-2 border border-border rounded-full hover:bg-accent transition-colors"
                    >
                      Start over
                    </button>
                  </div>
                </>
              )}
            </div>

            {(state.type === "recording" || state.type === "paused") && (
              <p className="text-center text-sm text-muted-foreground">
                You can stop anytime
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
