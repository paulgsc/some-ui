import type { FC } from "react"
import { StyledCharacters } from "@neon-sign/components/styled-characters"
import { OverlayInput } from "some-ui-shared"
import { cn, useLocalStorage } from "some-ui-utils"

type NeonTextProps = {
  initialText?: string
  className?: string
  storageKey?: string
}

export const NeonText: FC<NeonTextProps> = ({
  initialText = "Change me...",
  storageKey = "neon",
  className,
}) => {
  const { value: neonTxt, setValue: updateStorage } = useLocalStorage(
    storageKey,
    initialText
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    updateStorage(e.target.value)
  }

  return (
    <div className={cn("relative size-full", className)}>
      <div
        className="animate-pulse-slow size-full rounded-lg border-4 border-blue-500 px-8 py-4 text-center
                                                                       [box-shadow:0_0_0.5rem_#3b82f6,inset_0_0_0.5rem_#3b82f6]"
      >
        <StyledCharacters text={neonTxt} />
        <OverlayInput value={neonTxt} onChange={handleInputChange} />
      </div>
    </div>
  )
}
