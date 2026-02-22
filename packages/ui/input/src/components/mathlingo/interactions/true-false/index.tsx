import type { JSX } from "react"
import { useState } from "react"

type TrueFalseProps = {
  onSubmit: (answer: boolean) => void
  disabled?: boolean
  correctAnswer?: boolean
  showResult?: boolean
}

export const TrueFalse = ({
  onSubmit,
  disabled = false,
  correctAnswer,
  showResult = false,
}: TrueFalseProps): JSX.Element => {
  const [selected, setSelected] = useState<boolean | null>(null)

  const handleSelect = (answer: boolean): void => {
    if (disabled) return
    setSelected(answer)
    onSubmit(answer)
  }

  const getButtonClasses = (value: boolean): string => {
    const isSelected = selected === value
    const isCorrect = showResult && value === correctAnswer
    const isWrong = showResult && isSelected && value !== correctAnswer

    return `
      flex-1 py-4 px-8 rounded-lg border-2 font-mono text-lg font-semibold transition-all duration-200
      ${disabled ? "cursor-default" : "cursor-pointer"}
      ${!showResult && !isSelected ? "border-border bg-card hover:border-primary/50 hover:bg-secondary/50" : ""}
      ${isSelected && !showResult ? "border-primary bg-primary/10 text-primary" : ""}
      ${isCorrect ? "border-success bg-success/10 text-success" : ""}
      ${isWrong ? "border-destructive bg-destructive/10 text-destructive" : ""}
      ${showResult && !isCorrect && !isWrong ? "border-border bg-card text-muted-foreground" : ""}
    `
  }

  return (
    <div className="flex gap-4">
      <button
        onClick={() => handleSelect(true)}
        disabled={disabled}
        className={getButtonClasses(true)}
      >
        TRUE
      </button>
      <button
        onClick={() => handleSelect(false)}
        disabled={disabled}
        className={getButtonClasses(false)}
      >
        FALSE
      </button>
    </div>
  )
}
