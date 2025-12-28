import type { FC } from "react"
import { cn } from "some-ui-utils"

import type { StatusCard as StatusCardType } from "@/lib/slideshow-data"

type StatusCardProps = {
  card: StatusCardType
}

export const StatusCard: FC<StatusCardProps> = ({ card }) => {
  const statusColors = {
    completed: "border-l-green-600",
    current: "border-l-yellow-600",
    planned: "border-l-gray-500",
  }

  const tagColors = {
    tech: "bg-red-500/15 text-red-400 border-red-500/30",
    status: "bg-green-500/15 text-green-400 border-green-500/30",
    default: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-l-4 border-gray-600 bg-gray-800/80 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:transform hover:border-blue-400 hover:shadow-lg hover:shadow-blue-400/15",
        statusColors[card.status]
      )}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="text-lg">{card.icon}</span>
        <span className="text-lg font-semibold text-white">{card.title}</span>
      </div>
      <p className="mb-4 text-gray-300">{card.description}</p>
      <div className="flex flex-wrap gap-1">
        {card.tags.map((tag, index) => (
          <span
            key={index}
            className={cn(
              "inline-block rounded border px-2 py-1 text-xs font-medium",
              tagColors[tag.variant]
            )}
          >
            {tag.text}
          </span>
        ))}
      </div>
    </div>
  )
}
