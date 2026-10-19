import type { FC } from "react"
import type { ChoiceScreen } from "@leetype/types/session-file"
import { cn } from "@some-ui/core-utils"

type WorkedAnswerProps = {
  screen: ChoiceScreen
}

/**
 * A round's worked confirmation (canon v1.2, Def. 1.9's w): the option that
 * holds, then what each other option breaks, then the rule that decides it,
 * named only here, after the commitment (Rem. 9.4).
 */
export const WorkedAnswer: FC<WorkedAnswerProps> = ({ screen }) => (
  <div className="flex flex-col gap-3">
    {screen.options.map((option, index) =>
      option.abstain ? null : (
        <div key={`${String(index)} ${option.label}`}>
          <p
            className={cn(
              "font-medium",
              option.correct ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {option.correct ? "Holds: " : "Breaks: "}
            {option.label}
          </p>
          {option.feedback !== undefined && (
            <p className="text-pretty text-muted-foreground">
              {option.feedback}
            </p>
          )}
        </div>
      )
    )}
    {screen.rule !== undefined && (
      <p className="text-xs text-muted-foreground">Decided by {screen.rule}.</p>
    )}
  </div>
)
