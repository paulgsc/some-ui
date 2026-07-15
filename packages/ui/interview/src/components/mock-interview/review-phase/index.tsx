import { AudioPlayer } from "@interview/components/mock-interview/audio-player"
import type { TranscriptionResult } from "@interview/lib/interview/core/interview-types"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button, Card, Textarea } from "some-ui-shared"

type ReviewPhaseProps = {
  audioUrl: string | null
  transcription: TranscriptionResult | null
  onTranscriptChange: (transcript: string) => void
  onContinue: () => void
  onRetry: () => void
  isLastQuestion: boolean
}

export const ReviewPhase = ({
  audioUrl,
  transcription,
  onTranscriptChange,
  onContinue,
  onRetry,
  isLastQuestion,
}: ReviewPhaseProps): React.JSX.Element => {
  const status = transcription?.status ?? "pending"

  if (status === "pending" || status === "processing") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-2xl w-full p-12">
          <div className="flex flex-col items-center space-y-6">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-medium">
                {status === "pending" ? "Uploading..." : "Transcribing..."}
              </h2>
              <p className="text-muted-foreground">
                This will just take a moment
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-2xl w-full p-12">
          <div className="flex flex-col items-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-medium">
                Couldn&apos;t transcribe that
              </h2>
              <p className="text-muted-foreground">
                {transcription?.error ??
                  "Something went wrong. Give it another try."}
              </p>
            </div>
            <Button size="lg" onClick={onRetry} className="px-12 rounded-full">
              Record again
            </Button>
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
                This is just for you—edit or review as you&apos;d like
              </p>
            </div>

            {audioUrl && <AudioPlayer url={audioUrl} />}

            <Textarea
              value={transcription?.transcript ?? ""}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                onTranscriptChange(e.target.value)
              }
              className="min-h-48 resize-none leading-relaxed"
            />

            <div className="bg-accent/30 rounded-2xl p-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Remember, there&apos;s no scoring or evaluation here. This space
                is for you to practice expressing your thoughts and building
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
