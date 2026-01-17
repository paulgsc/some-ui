import { useEffect, useRef, useState } from "react"
import { Mic, RotateCcw, Square } from "lucide-react"
import { Button, Card } from "some-ui-shared"

type RecordingPhaseProps = {
  question: string
  onComplete: (transcript: string) => void
}

export const RecordingPhase = ({
  question,
  onComplete,
}: RecordingPhaseProps) => {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  useEffect(() => {
    if (isRecording && !isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1)
      }, 1000)
    }
    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRecording, isPaused])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const handleStart = (): void => {
    setIsRecording(true)
    setIsPaused(false)
  }

  const handlePause = (): void => {
    setIsPaused(true)
  }

  const handleResume = (): void => {
    setIsPaused(false)
  }

  const handleStop = (): void => {
    setIsRecording(false)
    // Simulate transcription with mock text
    setTimeout(() => {
      const mockTranscript = `I would design a URL shortening service with the following approach: First, I'd use a hash function to generate short codes from long URLs. The system would need a database to store mappings between short codes and original URLs. For scalability, I would implement caching using Redis and use a load balancer to distribute traffic. The API would have two main endpoints: one for creating short URLs and another for redirecting. I'd also consider adding analytics to track usage.`
      onComplete(mockTranscript)
    }, 2000)
  }

  const handleRestart = (): void => {
    setIsRecording(false)
    setElapsedTime(0)
    setIsPaused(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-3xl w-full space-y-6">
        <Card className="p-8 md:p-12 space-y-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-medium text-muted-foreground">
                The question
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground/80">
                {question}
              </p>
            </div>

            {/* Recording visualization */}
            <div className="flex flex-col items-center justify-center space-y-8 py-8">
              {!isRecording ? (
                <>
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                      <Mic className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <Button
                    size="lg"
                    onClick={handleStart}
                    className="gap-2 px-12 rounded-full"
                  >
                    <Mic className="w-4 h-4" />
                    Start speaking
                  </Button>
                </>
              ) : (
                <>
                  {/* Pulsing mic indicator */}
                  <div className="relative">
                    <div
                      className={`w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center ${
                        !isPaused ? "animate-pulse" : ""
                      }`}
                    >
                      <div className="w-20 h-20 rounded-full bg-primary/30 flex items-center justify-center">
                        <Mic className="w-10 h-10 text-primary" />
                      </div>
                    </div>
                    {!isPaused && (
                      <>
                        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                        <div
                          className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping"
                          style={{ animationDelay: "0.5s" }}
                        />
                      </>
                    )}
                  </div>

                  {/* Optional elapsed time - minimized */}
                  <p className="text-sm text-muted-foreground">
                    {formatTime(elapsedTime)}
                  </p>

                  {/* Controls */}
                  <div className="flex items-center gap-4">
                    {!isPaused ? (
                      <Button
                        size="lg"
                        variant="secondary"
                        onClick={handlePause}
                        className="rounded-full px-8"
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        onClick={handleResume}
                        className="rounded-full px-8"
                      >
                        Resume
                      </Button>
                    )}

                    <Button
                      size="lg"
                      onClick={handleStop}
                      className="gap-2 rounded-full px-8"
                    >
                      <Square className="w-4 h-4" />
                      Finish
                    </Button>

                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleRestart}
                      className="gap-2 rounded-full bg-transparent"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>

            <p className="text-center text-sm text-muted-foreground">
              You can stop anytime
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
