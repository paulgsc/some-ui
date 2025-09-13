import "./index.css"

import type { FC } from "react"

export const TvFooter: FC = () => {
  return (
    <div className="flex items-center justify-around">
      <div className="bg-gradient-leg clip-path-leg inline-block h-5 w-10" />
      <div className="bg-gradient-leg clip-path-leg inline-block h-5 w-10" />
    </div>
  )
}
