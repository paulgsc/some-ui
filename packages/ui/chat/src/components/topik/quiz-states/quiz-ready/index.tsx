import { BookOpen, PlayCircle } from "lucide-react"
import { Button, Card } from "some-ui-shared"

type QuizReadyProps = {
  onStartQuiz: () => void
}

export const QuizReady = ({ onStartQuiz }: QuizReadyProps) => {
  return (
    <Card className="h-full border-2 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="text-center max-w-xl space-y-8">
          <div className="inline-flex items-center justify-center p-6 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl">
            <BookOpen className="size-20 text-primary" />
          </div>

          <div className="space-y-4">
            <h2 className="text-4xl font-bold tracking-tight">
              Comprehension Checkpoint
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              You'll be tested on vocabulary, grammar patterns, and contextual
              understanding from the conversation you just reviewed.
            </p>
          </div>

          <div className="grid gap-3 text-left bg-muted/30 p-6 rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                1
              </div>
              <p className="text-sm">
                Read the Korean phrase or context carefully
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                2
              </div>
              <p className="text-sm">
                Listen to the audio pronunciation (optional)
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                3
              </div>
              <p className="text-sm">
                Select your answer or type your response
              </p>
            </div>
          </div>

          <Button
            size="lg"
            onClick={onStartQuiz}
            className="text-lg py-6 w-full"
          >
            <PlayCircle className="size-5 mr-2" />
            Begin Assessment
          </Button>
        </div>
      </div>
    </Card>
  )
}
