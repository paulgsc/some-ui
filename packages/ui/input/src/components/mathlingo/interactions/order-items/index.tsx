import type { DragEvent, JSX } from "react"
import { useState } from "react"
import type { Option } from "@input/types/mathlingo"
import { Button } from "@some-ui/shared"

type OrderItemsProps = {
  options: Array<Option>
  onSubmit: (orderedIds: Array<string>) => void
  disabled?: boolean
  correctOrder?: Array<string>
  showResult?: boolean
}

export const OrderItems = ({
  options,
  onSubmit,
  disabled = false,
  correctOrder = [],
  showResult = false,
}: OrderItemsProps): JSX.Element => {
  const [items, setItems] = useState<Array<Option>>(options)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const handleDragStart = (index: number): void => {
    if (disabled) return
    setDraggedIndex(index)
  }

  const handleDragOver = (e: DragEvent, index: number): void => {
    e.preventDefault()
    if (disabled || draggedIndex === null || draggedIndex === index) return

    const newItems = [...items]
    const draggedItem = newItems[draggedIndex]

    // Safety guard to fix "Option | undefined" assignment error
    if (!draggedItem) return

    newItems.splice(draggedIndex, 1)
    newItems.splice(index, 0, draggedItem)
    setItems(newItems)
    setDraggedIndex(index)
  }

  const handleDragEnd = (): void => {
    setDraggedIndex(null)
  }

  const handleSubmit = (): void => {
    if (disabled) return
    onSubmit(items.map((item) => item.id))
  }

  const moveItem = (fromIndex: number, direction: "up" | "down"): void => {
    if (disabled) return
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= items.length) return

    const newItems = [...items]
    const currentItem = newItems[fromIndex]
    const targetItem = newItems[toIndex]

    // Guard against undefined during swap
    if (currentItem && targetItem) {
      newItems[fromIndex] = targetItem
      newItems[toIndex] = currentItem
      setItems(newItems)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index): JSX.Element => {
        const isCorrectPosition = showResult && correctOrder[index] === item.id
        const isWrongPosition = showResult && correctOrder[index] !== item.id

        return (
          <div
            key={item.id}
            draggable={!disabled}
            onDragStart={(): void => handleDragStart(index)}
            onDragOver={(e: DragEvent): void => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`
              flex items-center gap-3 p-4 rounded-lg border transition-all duration-200
              ${disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"}
              ${draggedIndex === index ? "opacity-50" : ""}
              ${isCorrectPosition ? "border-success bg-success/10" : ""}
              ${isWrongPosition ? "border-destructive bg-destructive/10" : ""}
              ${!showResult ? "border-border bg-card hover:border-primary/30" : ""}
            `}
          >
            {/* Drag handle icon */}
            <div className="text-muted-foreground">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8h16M4 16h16"
                />
              </svg>
            </div>

            <span
              className={`
              w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold
              ${isCorrectPosition ? "bg-success text-success-foreground" : ""}
              ${isWrongPosition ? "bg-destructive text-destructive-foreground" : ""}
              ${!showResult ? "bg-secondary text-secondary-foreground" : ""}
            `}
            >
              {index + 1}
            </span>

            <span
              className={`flex-1 font-mono text-sm ${showResult && isWrongPosition ? "text-destructive" : ""}`}
            >
              {item.label}
            </span>

            {!disabled && !showResult && (
              <div className="flex flex-col gap-1 md:hidden">
                <button
                  type="button"
                  onClick={(): void => moveItem(index, "up")}
                  disabled={index === 0}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(): void => moveItem(index, "down")}
                  disabled={index === items.length - 1}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )
      })}

      {!disabled && !showResult && (
        <Button onClick={handleSubmit} className="mt-2 w-full">
          Submit Order
        </Button>
      )}
    </div>
  )
}
