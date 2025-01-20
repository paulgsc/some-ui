import type { ChangeEvent, FC } from "react"
import { Input } from "some-ui-shared"
import { cn, useLocalStorage } from "some-ui-utils"

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

  const characters = neonTxt.split("")

  const shouldHaveNeonEffect = (): boolean => Math.random() > 0.5

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    updateStorage(e.target.value)
  }

  const StyledCharacters = characters.map((char, index) => {
    const hasNeonEffect = shouldHaveNeonEffect()

    if (hasNeonEffect) {
      const effect = Math.random()
      return (
        <span
          key={index}
          className={cn(
            "text-red-500 [text-shadow:0_0_0.5rem_#ef4444,0_0_1.5rem_#ef4444]",
            {
              "animate-flicker-slow": effect < 0.3,
              "animate-flicker": effect >= 0.3 && effect < 0.7,
              "animate-flicker-fast": effect >= 0.7,
            }
          )}
        >
          {char}
        </span>
      )
    }
    return (
      <span key={index} className="text-gray-500">
        {char}
      </span>
    )
  })
  return (
    <div className="relative">
      <div
        className="animate-pulse-slow rounded-lg border-4 border-blue-500 px-8 py-4 text-center
                                         [box-shadow:0_0_0.5rem_#3b82f6,inset_0_0_0.5rem_#3b82f6]"
      >
        <span className="size-full text-center text-4xl font-bold tracking-wider">
          {StyledCharacters}
        </span>
        <Input
          type="text"
          value={neonTxt}
          onChange={handleInputChange}
          className={cn(
            "absolute inset-0 size-full border-none bg-transparent text-4xl font-bold tracking-wider text-transparent",
            "focus:border-input focus:ring-2 focus:ring-blue-500 focus:backdrop-blur-lg",
            "caret-transparent focus:caret-pink-500"
          )}
        />
      </div>
    </div>
  )
}

export default NeonSignText
