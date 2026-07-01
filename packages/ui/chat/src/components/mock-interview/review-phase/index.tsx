import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button, Card, Textarea } from "some-ui-shared"

type ReviewPhaseProps = {
  transcript: string
  onContinue: () => void
  onRetry: () => void
  isLastQuestion: boolean
}

export const ReviewPhase = ({
  transcript,
  onContinue,
  onRetry,
  isLastQuestion,
}: ReviewPhaseProps): React.JSX.Element => {
  const [isTranscribing, setIsTranscribing] = useState(true)
  const [editedTranscript, setEditedTranscript] = useState("")

  // Simulate transcription delay
  useState(() => {
    setTimeout(() => {
      setIsTranscribing(false)
      setEditedTranscript(transcript)
    }, 2000)
  })

  if (isTranscribing) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-2xl w-full p-12">
          <div className="flex flex-col items-center space-y-6">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-medium">Transcribing...</h2>
              <p className="text-muted-foreground">
                This will just take a moment
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-3xl w-full space-y-6">
        <Card className="p-8 md:p-12 space-y-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-2xl font-medium">Your Response</h2>
              <p className="text-muted-foreground">
                This is just for you—edit or review as you'd like
              </p>
            </div>

            <Textarea
              value={editedTranscript}
              onChange={(e) => setEditedTranscript(e.target.value)}
              className="min-h-48 resize-none leading-relaxed"
            />

            <div className="bg-accent/30 rounded-2xl p-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Remember, there's no scoring or evaluation here. This space is
                for you to practice expressing your thoughts and building
                confidence.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={onContinue}
                className="w-full sm:w-auto px-12 rounded-full"
              >
                {isLastQuestion ? "Complete practice" : "Continue when ready"}
              </Button>

              <Button
                size="lg"
                variant="outline"
                onClick={onRetry}
                className="w-full sm:w-auto px-8 rounded-full bg-transparent"
              >
                Try this one again
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
