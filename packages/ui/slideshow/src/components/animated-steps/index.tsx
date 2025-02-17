import { CSSProperties, FC } from "react"

export interface Step {
  text: string
  number: number
}

type AnimatedStepsProps = {}

export const AnimatedSteps: FC<AnimatedStepsProps> = ({}) => {
  return (
    <section className="flex min-h-screen items-center justify-center border border-red-100">
      <ul
        style={{ "--step-duration": 5, "--step-delay": 5 } as CSSProperties}
        className="perspective-1100  scale-z-25 translate-z-20 preserve-3d step-delay overflow-hidden size-72 border border-green-300 flex flex-col gap-4"
      >
        <li className="w-full p-4 text-center bg-blue-400 text-white rounded-lg animate-slide-right"></li>
        <li className="w-full p-4 text-center bg-red-400 text-white rounded-lg animate-slide-left"></li>
        <li className="w-full p-4 text-center bg-green-400 text-white rounded-lg animate-slide-right"></li>
      </ul>
    </section>
  )
}
