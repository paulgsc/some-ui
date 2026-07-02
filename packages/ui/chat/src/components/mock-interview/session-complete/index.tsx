import { CheckCircle2, PartyPopper, RotateCcw } from "lucide-react"
import { Badge, Button, Card, SparkleBurst } from "some-ui-shared"

import { formatTime } from "@chat/lib/interview/format-time"
import type {
  Question,
  SessionAnswer,
} from "@chat/lib/interview/core/interview-types"

type SessionCompleteProps = {
  answers: Array<SessionAnswer>
  questions: Array<Question>
  onRestart: () => void
}

const CATEGORY_LABEL: Record<Question["category"], string> = {
  behavioral: "Behavioral",
  "system-design": "System design",
  technical: "Technical",
  leadership: "Leadership",
}

export const SessionComplete = ({
  answers,
  questions,
  onRestart,
}: SessionCompleteProps): React.JSX.Element => {
  const totalSeconds = answers.reduce((sum, a) => sum + a.durationSeconds, 0)

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-6">
        <Card className="p-8 md:p-12 space-y-8 text-center overflow-hidden">
          <div className="relative flex items-center justify-center">
            <div className="absolute size-48 pointer-events-none">
              <SparkleBurst particleCount={90} maxDurationMs={1400} />
            </div>
            <div className="relative inline-flex items-center justify-center p-6 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20">
              <PartyPopper className="size-14 text-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight">
              Nice work, that&apos;s a wrap
            </h1>
            <p className="text-muted-foreground text-lg text-pretty">
              You practiced {answers.length}{" "}
              {answers.length === 1 ? "question" : "questions"} out loud.
              That&apos;s the hard part.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/50 rounded-2xl p-6">
              <div className="text-3xl font-medium">{answers.length}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Questions practiced
              </div>
            </div>
            <div className="bg-muted/50 rounded-2xl p-6">
              <div className="text-3xl font-medium">
                {formatTime(totalSeconds)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Time spent speaking
              </div>
            </div>
          </div>

          <div className="space-y-3 text-left">
            {answers.map((answer) => {
              const question = questions.find((q) => q.id === answer.questionId)
              if (!question) return null
              return (
                <div
                  key={answer.questionId}
                  className="flex items-start gap-3 rounded-xl border border-border p-4"
                >
                  <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORY_LABEL[question.category]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(answer.durationSeconds)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-1">
                      {question.question}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-accent/30 rounded-2xl p-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Come back whenever you want another round. Consistency, not
              perfection, is what builds confidence for the real thing.
            </p>
          </div>

          <Button
            size="lg"
            onClick={onRestart}
            className="w-full sm:w-auto px-12 rounded-full gap-2"
          >
            <RotateCcw className="size-4" />
            Practice again
          </Button>
        </Card>
      </div>
    </div>
  )
}
