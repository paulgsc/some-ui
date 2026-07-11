import { useEffect, useReducer } from "react"
import {
  buildCharacters,
  characterReducer,
} from "@neon-sign/lib/character-reducer"

type Character = {
  char: string
  x: number
  y: number
  speed: number
}

export const useCharacters = (charCount: number): Array<Character> => {
  const [characters, dispatch] = useReducer(
    characterReducer,
    charCount,
    buildCharacters
  )

  useEffect(() => {
    dispatch({
      type: "reset",
      count: charCount,
    })
  }, [charCount])

  useEffect(() => {
    let animationFrameId = 0

    const animate = (): void => {
      dispatch({ type: "tick" })
      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    return (): void => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return characters
}
