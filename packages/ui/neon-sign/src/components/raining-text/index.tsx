import { FC } from "react"
import { RainingCharacter } from "@neon-sign/components/raining-character"
import { ScrambledTitle } from "@neon-sign/components/scrambled-title"
import { useActiveIndices } from "@neon-sign/hooks/use-active-indices"
import { useCharacters } from "@neon-sign/hooks/use-characters"

export const RainingLetters: FC = () => {
  const characters = useCharacters(300)
  const activeIndices = useActiveIndices(characters.length, 3)

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Title */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
        <ScrambledTitle />
      </div>

      {/* Raining Characters */}
      {characters.map((char, index) => (
        <RainingCharacter
          key={index}
          char={char.char}
          x={char.x}
          y={char.y}
          isActive={activeIndices.has(index)}
        />
      ))}

      <style jsx global>{`
        .dud {
          color: #0f0;
          opacity: 0.7;
        }
      `}</style>
    </div>
  )
}
