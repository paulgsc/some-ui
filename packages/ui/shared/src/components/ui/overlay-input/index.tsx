import type { ChangeEvent, FC } from "react"
import { Input } from "@shared/components/ui"
import { cn } from "@shared/lib/utils"

type OverlayInputProps = {
  className?: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export const OverlayInput: FC<OverlayInputProps> = ({
  className,
  value,
  onChange,
}) => (
  <Input
    type="text"
    value={value}
    onChange={onChange}
    className={cn(
      "absolute inset-0 size-full border-none bg-transparent text-4xl font-bold tracking-wider text-transparent",
      "focus:border-input focus:ring-2 focus:ring-blue-500 focus:backdrop-blur-lg",
      "caret-transparent focus:caret-pink-500",
      className
    )}
  />
)
