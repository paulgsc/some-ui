import type { JSX } from "react"
import { useState } from "react"
import type { Option } from "@input/types/mathlingo"

type TransformSelectProps = {
  options: Array<Option>
  onSubmit: (selectedId: string) => void
  disabled?: boolean
  correctAnswer?: string
  showResult?: boolean
}

export const TransformSelect = ({
  options,
  onSubmit,
  disabled = false,
  correctAnswer,
  showResult = false,
}: TransformSelectProps): JSX.Element => {
  const [selected, setSelected] = useState<string | null>(null)

  const handleSelect = (id: string): void => {
    if (disabled) return
    setSelected(id)
    onSubmit(id)
  }

  return (
    <div className="flex flex-wrap gap-3 justify-center">
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
              px-5 py-3 rounded-lg border font-mono text-sm transition-all duration-200
              ${disabled ? "cursor-default" : "cursor-pointer hover:border-primary hover:bg-primary/10"}
              ${isSelected && !showResult ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}
              ${isCorrect ? "border-success bg-success text-success-foreground" : ""}
              ${isWrong ? "border-destructive bg-destructive text-destructive-foreground" : ""}
              ${showResult && !isCorrect && !isWrong ? "opacity-50" : ""}
            `}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
