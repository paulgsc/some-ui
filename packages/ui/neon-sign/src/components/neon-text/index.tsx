import type { FC } from "react"
import { StyledCharacters } from "@neon-sign/components/styled-characters"
import { OverlayInput } from "some-ui-shared"
import { useLocalStorage } from "some-ui-utils"

type NeoSignTextProps = {
  initialText?: string
}

const NeonSignText: FC<NeoSignTextProps> = ({
  initialText = "Change me...",
}) => {
  const { value: neonTxt, setValue: updateStorage } = useLocalStorage(
    "neon",
    initialText
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    updateStorage(e.target.value)
  }

  return (
    <div className="relative">
      <div
        className="animate-pulse-slow rounded-lg border-4 border-blue-500 px-8 py-4 text-center
                                                                       [box-shadow:0_0_0.5rem_#3b82f6,inset_0_0_0.5rem_#3b82f6]"
      >
        <span className="size-full text-center text-4xl font-bold tracking-wider">
          <StyledCharacters text={neonTxt} />
        </span>
        <OverlayInput value={neonTxt} onChange={handleInputChange} />
      </div>
    </div>
  )
}

export default NeonSignText
