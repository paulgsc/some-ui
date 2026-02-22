import type { JSX } from "react"
import { useState } from "react"
import type { Option } from "@input/types/mathlingo"
import { Button } from "some-ui-shared"

type MultiChoiceProps = {
  options: Array<Option>
  onSubmit: (selectedIds: Array<string>) => void
  disabled?: boolean
  correctAnswers?: Array<string>
  showResult?: boolean
}

export const MultiChoice = ({
  options,
  onSubmit,
  disabled = false,
  correctAnswers = [],
  showResult = false,
}: MultiChoiceProps): JSX.Element => {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleOption = (id: string): void => {
    if (disabled) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSubmit = (): void => {
    if (disabled) return
    onSubmit(Array.from(selected))
  }

  return (
    <div className="flex flex-col gap-3">
      {options.map((option): JSX.Element => {
        const isSelected = selected.has(option.id)
        const isCorrect = showResult && correctAnswers.includes(option.id)
        const isWrongSelection =
          showResult && isSelected && !correctAnswers.includes(option.id)
        const isMissed =
          showResult && !isSelected && correctAnswers.includes(option.id)

        return (
          <button
            key={option.id}
            type="button"
            onClick={(): void => toggleOption(option.id)}
            disabled={disabled}
            className={`
              w-full p-4 rounded-lg border text-left transition-all duration-200
              ${disabled ? "cursor-default" : "cursor-pointer hover:border-primary/50 hover:bg-secondary/50"}
              ${isSelected && !showResult ? "border-primary bg-primary/10" : "border-border bg-card"}
              ${isCorrect && isSelected ? "border-success bg-success/10 text-success" : ""}
              ${isMissed ? "border-success/50 bg-success/5" : ""}
              ${isWrongSelection ? "border-destructive bg-destructive/10 text-destructive" : ""}
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`
                  w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                  ${isSelected && !showResult ? "border-primary bg-primary" : "border-muted-foreground"}
                  ${isCorrect && isSelected ? "border-success bg-success" : ""}
                  ${isMissed ? "border-success" : ""}
                  ${isWrongSelection ? "border-destructive bg-destructive" : ""}
                `}
              >
                {(isSelected && !showResult) || (isCorrect && isSelected) ? (
                  <svg
                    className={`w-3 h-3 ${isCorrect ? "text-success-foreground" : "text-primary-foreground"}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
                {isWrongSelection && (
                  <svg
                    className="w-3 h-3 text-destructive-foreground"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <span
                className={`font-mono text-sm ${showResult && !isCorrect && !isWrongSelection ? "text-muted-foreground" : ""}`}
              >
                {option.label}
              </span>
            </div>
          </button>
        )
      })}

      {!disabled && !showResult && (
        <Button
          onClick={handleSubmit}
          disabled={selected.size === 0}
          className="mt-2 w-full"
        >
          Submit
        </Button>
      )}
    </div>
  )
}
