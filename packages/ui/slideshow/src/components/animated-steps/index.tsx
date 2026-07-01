import "./index.css"

import type { CSSProperties, FC } from "react"

export type Step = {
  text: string
  number: number
}

type AnimatedStepsProps = {}

export const AnimatedSteps: FC<AnimatedStepsProps> = ({}) => {
  return (
    <section className="flex min-h-screen items-center justify-center border border-red-100">
      <ul
        style={{ "--step-duration": 5, "--step-delay": 5 } as CSSProperties}
        className="perspective-1100  scale-z-25 translate-z-20 preserve-3d step-delay flex size-72 flex-col gap-4 overflow-hidden border border-green-300"
      >
        <li className="animate-slide-right w-full rounded-lg bg-blue-400 p-4 text-center text-white" />
        <li className="animate-slide-left w-full rounded-lg bg-red-400 p-4 text-center text-white" />
        <li className="animate-slide-right w-full rounded-lg bg-green-400 p-4 text-center text-white" />
      </ul>
    </section>
  )
}
