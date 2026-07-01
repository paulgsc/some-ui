import { useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw } from "lucide-react"
import { Button, Card } from "some-ui-shared"

type Question = {
  id: string
  level: string
  category: string
  question: string
  durationSeconds: number
}

type QuestionPlaybackProps = {
  question: Question
  questionNumber: number
  totalQuestions: number
  onComplete: () => void
}

export const QuestionPlayback = ({
  question,
  questionNumber,
  totalQuestions,
  onComplete,
}: QuestionPlaybackProps): React.JSX.Element => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showMetadata, setShowMetadata] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  // Simulate TTS playback (5 seconds)
  const playbackDuration = 5000

  useEffect(() => {
    if (isPlaying) {
      const startTime = Date.now()
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        const newProgress = Math.min((elapsed / playbackDuration) * 100, 100)
        setProgress(newProgress)

        if (newProgress >= 100) {
          setIsPlaying(false)
          setProgress(100)
        }
      }, 50)
    }
    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying])

  const handlePlay = (): void => {
    if (progress >= 100) {
      setProgress(0)
    }
    setIsPlaying(true)
  }

  const handlePause = (): void => {
    setIsPlaying(false)
  }

  const handleReplay = (): void => {
    setProgress(0)
    setIsPlaying(true)
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

            {/* Waveform visualization */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 h-16 justify-center">
                {[...Array(32)].map((_, i) => {
                  const height = isPlaying
                    ? Math.sin(progress * 0.1 + i * 0.5) * 20 + 30
                    : 20
                  return (
                    <div
                      key={i}
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
                  onClick={handlePause}
                  className="gap-2 rounded-full px-8"
                >
                  <Pause className="w-4 h-4" />
                  Pause
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
              Listen as many times as you'd like
            </p>
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
