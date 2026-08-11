import type { JSX } from "react"
import { Button, Card } from "@some-ui/shared"
import { BookOpen, PlayCircle } from "lucide-react"

type QuizReadyProps = {
  onStartQuiz: () => void
}

const STEPS: ReadonlyArray<string> = [
  "Read the Korean phrase or context carefully",
  "Listen to the audio pronunciation (optional)",
  "Select your answer or type your response",
]

/** Sized against the shortest pane the quiz is granted, like every stage. */
export const QuizReady = ({ onStartQuiz }: QuizReadyProps): JSX.Element => {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-2">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg space-y-3 text-center sm:space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="from-primary/20 to-accent/20 inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br p-2.5">
              <BookOpen className="text-primary size-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              Comprehension Checkpoint
            </h2>
          </div>

          <p className="text-muted-foreground text-sm leading-relaxed">
            You&apos;ll be tested on vocabulary, grammar patterns, and
            contextual understanding from the conversation you just reviewed.
          </p>

          <div className="bg-muted/30 grid gap-2 rounded-2xl p-4 text-left">
            {STEPS.map((step, index) => (
              <div key={step} className="flex items-start gap-3">
                <div className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                  {index + 1}
                </div>
                <p className="text-sm">{step}</p>
              </div>
            ))}
          </div>

          <Button onClick={onStartQuiz} className="w-full">
            <PlayCircle className="mr-2 size-4" />
            Begin Assessment
          </Button>
        </div>
      </div>
    </Card>
  )
}
