import { useEffect, useRef, useState } from "react"
import type {
  InterviewTTSAdapter,
  Question,
} from "@interview/lib/interview/core/interview-types"
import { Pause, Play, RotateCcw } from "lucide-react"
import { Button, Card } from "@some-ui/shared"

const WAVEFORM_BAR_KEYS = Array.from(
  { length: 32 },
  (_, i) => `waveform-bar-${i}`
)

type QuestionPlaybackProps = {
  question: Question
  questionNumber: number
  totalQuestions: number
  ttsAdapter: InterviewTTSAdapter
  onComplete: () => void
}

export const QuestionPlayback = ({
  question,
  questionNumber,
  totalQuestions,
  ttsAdapter,
  onComplete,
}: QuestionPlaybackProps): React.JSX.Element => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showMetadata, setShowMetadata] = useState(false)
  const playTokenRef = useRef(0)

  useEffect(() => {
    return (): void => {
      ttsAdapter.stop()
    }
  }, [ttsAdapter])

  const speak = (): void => {
    const token = ++playTokenRef.current
    setIsPlaying(true)

    void ttsAdapter
      .speak(question.question, {
        onBoundary: (charIndex) => {
          if (playTokenRef.current !== token) return
          setProgress(
            Math.min(100, (charIndex / question.question.length) * 100)
          )
        },
      })
      .then(() => {
        if (playTokenRef.current !== token) return
        setIsPlaying(false)
        setProgress(100)
      })
  }

  const handlePlay = (): void => {
    if (progress >= 100) setProgress(0)
    speak()
  }

  const handleStop = (): void => {
    playTokenRef.current += 1
    ttsAdapter.stop()
    setIsPlaying(false)
  }

  const handleReplay = (): void => {
    setProgress(0)
    speak()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-3xl w-full space-y-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Question {questionNumber} of {totalQuestions}
          </p>
        </div>

        <Card className="p-8 md:p-12 space-y-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-2xl md:text-3xl font-medium text-balance leading-relaxed">
                {question.question}
              </h2>

              <button
                onClick={() => setShowMetadata(!showMetadata)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showMetadata ? "Hide details" : "Show details"}
              </button>

              {showMetadata && (
                <div className="pt-4 space-y-2 text-sm text-muted-foreground border-t">
                  <p>Level: {question.level}</p>
                  <p>Category: {question.category}</p>
                </div>
              )}
            </div>

            {ttsAdapter.supported ? (
              <>
                {/* Waveform visualization */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 h-16 justify-center">
                    {WAVEFORM_BAR_KEYS.map((barKey, i) => {
                      const height = isPlaying
                        ? Math.sin(progress * 0.1 + i * 0.5) * 20 + 30
                        : 20
                      return (
                        <div
                          key={barKey}
                          className="w-1 bg-primary/30 rounded-full transition-all duration-100"
                          style={{ height: `${height}%` }}
                        />
                      )
                    })}
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/50 transition-all duration-100"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                  {!isPlaying ? (
                    <Button
                      size="lg"
                      onClick={handlePlay}
                      className="gap-2 rounded-full px-8"
                    >
                      <Play className="w-4 h-4" />
                      {progress > 0 && progress < 100 ? "Resume" : "Play"}
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      variant="secondary"
                      onClick={handleStop}
                      className="gap-2 rounded-full px-8"
                    >
                      <Pause className="w-4 h-4" />
                      Stop
                    </Button>
                  )}

                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleReplay}
                    className="gap-2 rounded-full bg-transparent"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Replay
                  </Button>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  Listen as many times as you&apos;d like
                </p>
              </>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Playback isn&apos;t available in this browser — read the
                question above whenever you&apos;re ready
              </p>
            )}
          </div>
        </Card>

        <div className="flex justify-center">
          <Button size="lg" onClick={onComplete} className="px-12 rounded-full">
            Continue when ready
          </Button>
        </div>
      </div>
    </div>
  )
}
