import type { FC } from "react"
import { cn } from "some-ui-utils"

type StyledCharactersProps = {
  text: string
}

const shouldHaveNeonEffect = (): boolean => Math.random() > 0.5

export const StyledCharacters: FC<StyledCharactersProps> = ({ text }) => {
  const words = text.trim().split(" ")
  return (
    <span
      className={cn(
        "flex size-full flex-1 items-center justify-center space-x-2.5 text-center text-4xl font-bold tracking-wider",
        "capitalize"
      )}
    >
      {words.map((word, i) => {
        const characters = word.split("")

        return (
          <span key={i}>
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
          </span>
        )
      })}
    </span>
  )
}
