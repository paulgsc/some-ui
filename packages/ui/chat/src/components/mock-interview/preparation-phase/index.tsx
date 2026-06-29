import type { ChangeEvent } from "react"
import { Button, Card, Textarea } from "some-ui-shared"

type PreparationPhaseProps = {
  question: string
  notes: string
  onNotesChange: (notes: string) => void
  onStartRecording: () => void
}

export const PreparationPhase = ({
  question,
  notes,
  onNotesChange,
  onStartRecording,
}: PreparationPhaseProps) => {
  return (
    <div className="flex absolute inset-0 items-center justify-center p-6">
      <div className="max-w-3xl w-full space-y-6">
        <Card className="p-8 md:p-12 space-y-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-medium text-muted-foreground">
                The question
              </h2>
              <p className="text-lg leading-relaxed">{question}</p>
            </div>

            <div className="bg-accent/30 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-medium">Take a moment to reflect</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You can jot down some thoughts here if it helps. These notes are
                private and optional—only for you.
              </p>
              <Textarea
                placeholder="Your private notes (optional)..."
                value={notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onNotesChange(e.target.value)}
                className="min-h-32 resize-none bg-background/50 border-muted"
              />
            </div>

            {/* Gentle breathing cue */}
            <div className="flex items-center justify-center py-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-primary/20" />
                </div>
              </div>
            </div>

            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                When you're ready, you can start speaking
              </p>
              <Button
                size="lg"
                onClick={onStartRecording}
                className="px-12 rounded-full"
              >
                I'm ready to speak
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
