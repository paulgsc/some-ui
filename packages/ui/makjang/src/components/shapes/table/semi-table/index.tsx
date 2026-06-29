import type { JSX } from "react"
export const SemiTable = (): JSX.Element => {
  return (
    <div className="border overflow-clip border-gray-950 w-192 h-96 perspective-[1500px] items-center justify-center ">
      <div className="rounded-full border rotate-x-90 -translate-z-10 transform-3d bg-gray-950 size-192 border-gray-950" />
    </div>
  )
}
