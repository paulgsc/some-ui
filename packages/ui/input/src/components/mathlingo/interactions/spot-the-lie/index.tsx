import type { JSX } from "react"
import { useState } from "react"
import type { Option } from "@input/types/mathlingo"

type SpotTheLieProps = {
  options: Array<Option>
  onSubmit: (selectedId: string) => void
  disabled?: boolean
  correctAnswer?: string
  showResult?: boolean
}

export const SpotTheLie = ({
  options,
  onSubmit,
  disabled = false,
  correctAnswer,
  showResult = false,
}: SpotTheLieProps): JSX.Element => {
  const [selected, setSelected] = useState<string | null>(null)

  const handleSelect = (id: string): void => {
    if (disabled) return
    setSelected(id)
    onSubmit(id)
  }

  return (
    <div className="flex flex-col gap-3">
      {options.map((option, index) => {
        const isSelected = selected === option.id
        const isTheLie = showResult && option.id === correctAnswer
        const isWrong = showResult && isSelected && option.id !== correctAnswer
        const isCorrectSelection =
          showResult && isSelected && option.id === correctAnswer

        return (
          <button
            key={option.id}
            onClick={() => handleSelect(option.id)}
            disabled={disabled}
            className={`
              w-full p-4 rounded-lg border text-left transition-all duration-200
              ${disabled ? "cursor-default" : "cursor-pointer hover:border-primary/50 hover:bg-secondary/50"}
              ${isSelected && !showResult ? "border-primary bg-primary/10" : "border-border bg-card"}
              ${isCorrectSelection ? "border-success bg-success/10" : ""}
              ${isTheLie && !isSelected ? "border-destructive/50 bg-destructive/5" : ""}
              ${isWrong ? "border-destructive bg-destructive/10" : ""}
            `}
          >
            <div className="flex items-start gap-3">
              <span
                className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold flex-shrink-0
                ${isCorrectSelection ? "bg-success text-success-foreground" : ""}
                ${isTheLie && !isSelected ? "bg-destructive text-destructive-foreground" : ""}
                ${isWrong ? "bg-destructive text-destructive-foreground" : ""}
                ${!showResult ? "bg-secondary text-secondary-foreground" : ""}
                ${showResult && !isTheLie && !isWrong ? "bg-muted text-muted-foreground" : ""}
              `}
              >
                {index + 1}
              </span>
              <span
                className={`
                font-mono text-sm leading-relaxed
                ${isCorrectSelection ? "text-success" : ""}
                ${isTheLie && !isSelected ? "text-destructive line-through" : ""}
                ${isWrong ? "text-destructive" : ""}
                ${showResult && !isTheLie && !isWrong && !isCorrectSelection ? "text-muted-foreground" : ""}
              `}
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
