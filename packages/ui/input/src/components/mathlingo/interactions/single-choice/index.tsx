import type { JSX } from "react"
import { useState } from "react"
import type { Option } from "@input/types/mathlingo"

type SingleChoiceProps = {
  options: Array<Option>
  onSubmit: (selectedId: string) => void
  disabled?: boolean
  correctAnswer?: string
  showResult?: boolean
}

export const SingleChoice = ({
  options,
  onSubmit,
  disabled = false,
  correctAnswer,
  showResult = false,
}: SingleChoiceProps): JSX.Element => {
  const [selected, setSelected] = useState<string | null>(null)

  const handleSelect = (id: string): void => {
    if (disabled) return
    setSelected(id)
    onSubmit(id)
  }

  return (
    <div className="flex flex-col gap-3">
      {options.map((option) => {
        const isSelected = selected === option.id
        const isCorrect = showResult && option.id === correctAnswer
        const isWrong = showResult && isSelected && option.id !== correctAnswer

        return (
          <button
            key={option.id}
            onClick={() => handleSelect(option.id)}
            disabled={disabled}
            className={`
              w-full p-4 rounded-lg border text-left transition-all duration-200
              ${disabled ? "cursor-default" : "cursor-pointer hover:border-primary/50 hover:bg-secondary/50"}
              ${isSelected && !showResult ? "border-primary bg-primary/10" : "border-border bg-card"}
              ${isCorrect ? "border-success bg-success/10 text-success" : ""}
              ${isWrong ? "border-destructive bg-destructive/10 text-destructive" : ""}
            `}
          >
            <div className="flex items-center gap-3">
              <div
                className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                  ${isSelected && !showResult ? "border-primary" : "border-muted-foreground"}
                  ${isCorrect ? "border-success bg-success" : ""}
                  ${isWrong ? "border-destructive bg-destructive" : ""}
                `}
              >
                {isSelected && !showResult && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                )}
                {isCorrect && (
                  <svg
                    className="w-3 h-3 text-success-foreground"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                {isWrong && (
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
                className={`font-mono text-sm ${showResult && !isCorrect && !isWrong ? "text-muted-foreground" : ""}`}
              >
                {option.label}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
