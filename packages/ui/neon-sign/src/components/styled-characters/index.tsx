import type { FC } from "react"
import { cn } from "some-ui-utils"

type StyledCharactersProps = {
  text: string
}

const shouldHaveNeonEffect = (): boolean => Math.random() > 0.5

export const StyledCharacters: FC<StyledCharactersProps> = ({ text }) => {
  const characters = text.split("")

  return (
    <>
      {characters.map((char, index) => {
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
      })}
    </>
  )
}
