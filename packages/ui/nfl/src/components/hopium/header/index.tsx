import type { FC } from "react"

type HeaderProps = {
  currentWeek: number
}

export const Header: FC<HeaderProps> = ({ currentWeek }) => {
  return (
    <div className="absoslute inset-0 border-b border-white/10 bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-2xl font-bold text-transparent">
            Chiefs Kingdom Mood Tracker
          </h1>
          <div className="animate-pulse rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white">
            LIVE
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">Week {currentWeek}</div>
          <div className="text-lg font-semibold">Kansas City Chiefs</div>
        </div>
      </div>
    </div>
  )
}
