import { useCallback, useEffect, useState } from "react"

type Character = {
  char: string
  x: number
  y: number
  speed: number
}

const CHAR_SET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?"

export const useCharacters = (charCount: number): Array<Character> => {
  const [characters, setCharacters] = useState<Array<Character>>([])

  const createCharacters = useCallback((): Array<Character> => {
    const newCharacters: Array<Character> = []

    for (let i = 0; i < charCount; i++) {
      // Use || "" or a non-null assertion to satisfy the string type constraint
      const randomChar =
        CHAR_SET[Math.floor(Math.random() * CHAR_SET.length)] ?? "A"

      newCharacters.push({
        char: randomChar,
        x: Math.random() * 100,
        y: Math.random() * 100,
        speed: 0.1 + Math.random() * 0.3,
      })
    }

    return newCharacters
  }, [charCount])

  useEffect(() => {
    setCharacters(createCharacters())
  }, [createCharacters])

  useEffect(() => {
    let animationFrameId: number

    const updatePositions = (): void => {
      setCharacters((prevChars) =>
        prevChars.map((char) => {
          if (char.y < 100) {
            return { ...char, y: char.y + char.speed }
          }

          // Reset character once it hits the bottom
          return {
            ...char,
            y: -5,
            x: Math.random() * 100,
            char: CHAR_SET[Math.floor(Math.random() * CHAR_SET.length)] ?? "A",
          }
        })
      )
    }

    const animate = (): void => {
      updatePositions()
      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)
    return (): void => cancelAnimationFrame(animationFrameId)
  }, [])

  return characters
}
