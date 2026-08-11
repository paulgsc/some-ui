import type { FC } from "react"
import { useState } from "react"
import { cn } from "some-ui-utils"

type StyledCharactersProps = {
  text: string
}

type FlickerSpeed = "slow" | "normal" | "fast"

type StyledCharacter = {
  id: string
  char: string
  neon: boolean
  speed: FlickerSpeed
}

const buildCharacterModel = (text: string): Array<Array<StyledCharacter>> =>
  text
    .trim()
    .split(/\s+/)
    .map((word) =>
      [...word].map((char) => {
        const effect = Math.random()

        return {
          id: crypto.randomUUID(),
          char,
          neon: Math.random() > 0.5,
          speed: effect < 0.3 ? "slow" : effect < 0.7 ? "normal" : "fast",
        }
      })
    )

export const StyledCharacters: FC<StyledCharactersProps> = ({ text }) => {
  const [words] = useState(() => buildCharacterModel(text))

  return (
    <span
      className={cn(
        "flex size-full flex-1 items-center justify-center space-x-2.5 text-center text-4xl font-bold tracking-wider",
        "capitalize"
      )}
    >
      {words.map((word) => (
        <span key={word.map(({ id }) => id).join(":")} className="inline-flex">
          {word.map(({ id, char, neon, speed }) => (
            <span
              key={id}
              className={cn({
                // eslint-disable-next-line theme-protocol/no-structural-palette-color -- an unlit neon tube, not muted text. This renders inside `.headline`, a component-scope skin that owns only its own --base-bg/--text-* tokens and defines no --muted-foreground, so a semantic token would resolve against the ambient theme rather than against the sign it sits on.
                "text-gray-500": !neon,
                "text-red-500 [text-shadow:0_0_0.5rem_#ef4444,0_0_1.5rem_#ef4444]":
                  neon,
                "animate-flicker-slow": neon && speed === "slow",
                "animate-flicker": neon && speed === "normal",
                "animate-flicker-fast": neon && speed === "fast",
              })}
            >
              {char}
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}
