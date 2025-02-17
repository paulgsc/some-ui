import { FC, useEffect } from "react"
import { useTextScramble } from "@neon-sign/hooks/use-text-scramble"
import { cn } from "some-ui-utils"

type ScrambledTitleProps = {
  className?: string
}

export const ScrambledTitle: FC<ScrambledTitleProps> = ({ className }) => {
  const { text, scrambleText } = useTextScramble("RAINING LETTERS")

  useEffect(() => {
    const phrases = [
      "Zuhair,",
      "It's RAINING",
      "with' letters",
      "and alphabets",
      "dont FORGET to bring",
      "your umbrella today",
    ]

    let counter = 0
    const next = () => {
      scrambleText(phrases[counter])
      counter = (counter + 1) % phrases.length
      setTimeout(next, 2000)
    }

    next()
  }, [scrambleText])

  return (
    <h1
      className={cn(
        "text-white text-6xl font-bold tracking-wider justify-center",
        className
      )}
    >
      {text}
    </h1>
  )
}
