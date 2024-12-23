import type { FC } from "react"

type NeoSignTextProps = {
  text?: string
}

const NeonSignText: FC<NeoSignTextProps> = ({ text = "NeonSign" }) => {
  const characters = text.split("")

  const shouldHaveNeonEffect = () => Math.random() > 0.5

  const StyledCharacters = characters.map((char, index) => {
    const hasNeonEffect = shouldHaveNeonEffect()

    if (hasNeonEffect) {
      return (
        <span
          key={index}
          className="animate-flicker text-red-500 [text-shadow:0_0_0.5rem_#ef4444,0_0_1.5rem_#ef4444]"
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
    <div className="flex min-h-screen items-start justify-center bg-none">
      <div className="relative">
        <div
          className="relative animate-pulse-slow rounded-lg border-4 border-blue-500 px-8 py-4
                                         [box-shadow:0_0_0.5rem_#3b82f6,inset_0_0_0.5rem_#3b82f6]"
        >
          <span className="text-4xl font-bold tracking-wider">
            {StyledCharacters}
          </span>
        </div>
      </div>
    </div>
  )
}

export default NeonSignText
