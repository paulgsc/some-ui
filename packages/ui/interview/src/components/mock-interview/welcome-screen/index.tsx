import { RotateCcw } from "lucide-react"
import { Button, Card } from "some-ui-shared"

type WelcomeScreenProps = {
  onStart: () => void
  resumeAvailable?: boolean
  onResume?: () => void
  onDiscardResume?: () => void
}

export const WelcomeScreen = ({
  onStart,
  resumeAvailable = false,
  onResume,
  onDiscardResume,
}: WelcomeScreenProps): React.JSX.Element => {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-2xl w-full p-8 md:p-12 space-y-8 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-balance">
            Practice at Your Pace
          </h1>
          <p className="text-lg text-muted-foreground text-pretty leading-relaxed">
            This is a supportive space to practice speaking your thoughts out
            loud. There&apos;s no pressure, no judgment, and no wrong answers.
          </p>
        </div>

        {resumeAvailable && (
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 space-y-4 text-left">
            <div className="flex items-center gap-2">
              <RotateCcw className="size-4 text-primary" />
              <p className="text-sm font-medium">
                Welcome back — you have a session in progress
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={onResume} className="rounded-full">
                Resume practice
              </Button>
              <Button
                variant="ghost"
                onClick={onDiscardResume}
                className="rounded-full"
              >
                Start fresh instead
              </Button>
            </div>
          </div>
        )}

        <div className="bg-muted/50 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            What to Expect
          </h2>
          <ul className="space-y-3 text-left text-muted-foreground">
            <li className="flex items-start gap-3">
              <span className="text-accent-foreground mt-0.5">•</span>
              <span>Listen to questions as many times as you&apos;d like</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-accent-foreground mt-0.5">•</span>
              <span>Take time to reflect before speaking</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-accent-foreground mt-0.5">•</span>
              <span>Pause, restart, or skip anytime</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-accent-foreground mt-0.5">•</span>
              <span>Everything stays private to you</span>
            </li>
          </ul>
        </div>

        {!resumeAvailable && (
          <Button
            size="lg"
            onClick={onStart}
            className="w-full md:w-auto px-12 text-base rounded-full"
          >
            Begin when you&apos;re ready
          </Button>
        )}

        <p className="text-sm text-muted-foreground">
          Remember: This is practice, not a test
        </p>
      </Card>
    </div>
  )
}
