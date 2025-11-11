import type { FC } from "react"

type TerminalHeaderProps = {
  title: string
}

export const TerminalHeader: FC<TerminalHeaderProps> = ({ title }) => {
  return (
    <div className="flex items-center gap-2.5 rounded-t-lg border border-gray-700 bg-gray-900/80 px-5 py-3 font-mono text-sm backdrop-blur-md">
      <div className="flex gap-1.5">
        <div className="size-3 rounded-full bg-red-500" />
        <div className="size-3 rounded-full bg-yellow-500" />
        <div className="size-3 rounded-full bg-green-500" />
      </div>
      <div className="ml-5 text-gray-400">{title}</div>
    </div>
  )
}
