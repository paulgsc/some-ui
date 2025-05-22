import { cn } from "some-ui-utils"

const cards = [
  {
    text: "Card 1",
    classNames: ["gradient-purple", "card-cycle-1"],
  },
  {
    text: "Card 2",
    classNames: ["gradient-blue", "card-cycle-2"],
  },
  {
    text: "Card 3",
    classNames: ["gradient-green", "card-cycle-3"],
  },
]

export const Tatu = () => {
  return (
    <div className="transform-3d perspective-distant relative h-64 w-96">
      <div className="transform-3d absolute inset-0 transition-all">
        {cards.map(({ text, classNames }, index) => (
          <div
            key={index}
            className={cn(
              "absolute inset-0 flex size-full items-center justify-center",
              "rounded-xl text-2xl font-bold text-white shadow-2xl",
              "backface-visible",
              ...classNames
            )}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  )
}
