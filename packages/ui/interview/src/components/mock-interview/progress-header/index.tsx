import type { InterviewPhase } from "@interview/lib/interview/core/interview-types"
import { Progress } from "@some-ui/shared"

const PHASE_LABEL: Partial<Record<InterviewPhase, string>> = {
  question: "Listening",
  preparation: "Reflecting",
  recording: "Recording",
  transcribing: "Transcribing",
  review: "Reviewing",
}

const PHASE_WEIGHT: Partial<Record<InterviewPhase, number>> = {
  question: 0.1,
  preparation: 0.35,
  recording: 0.65,
  transcribing: 0.85,
  review: 1,
}

type InterviewProgressHeaderProps = {
  current: number
  total: number
  phase: InterviewPhase
}

export const InterviewProgressHeader = ({
  current,
  total,
  phase,
}: InterviewProgressHeaderProps): React.JSX.Element => {
  const completedSteps = current - 1 + (PHASE_WEIGHT[phase] ?? 0)
  const value = total > 0 ? Math.min(100, (completedSteps / total) * 100) : 0
  const label = PHASE_LABEL[phase]

  return (
    <div className="max-w-3xl w-full mx-auto px-6 pt-6 space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Question {current} of {total}
        </span>
        {label && <span aria-live="polite">{label}</span>}
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  )
}
