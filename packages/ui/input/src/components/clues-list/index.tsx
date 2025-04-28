import type { FC } from "react"
import { useEffect, useState } from "react"
import { ClueCard } from "@input/components/crossword-clue"
import { cubeEventBus } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

type ClueListProps = {
  className?: string
}

export const ClueList: FC<ClueListProps> = ({ className }) => {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prevIndex) => {
        if (prevIndex + 1 >= cards.length)
          cubeEventBus.emit("rotate:next", undefined)
        return (prevIndex + 1) % cards.length
      })
    }, 3000)
  }, [])

  return (
    <ul
      className={cn(
        "bg-card flex size-full flex-col items-center gap-3 overflow-clip px-2.5 py-2",
        "justify-around rounded-lg shadow-md backdrop-blur-sm",
        className
      )}
    >
      {cards.map((curr, i) => (
        <li key={`clue_${i}`} className={cn("")}>
          <ClueCard
            thumbnail={curr.thumbnail}
            title={curr.title}
            clue={curr.channelInfo}
            updatedTime={curr.updatedTime}
            isActive={i === activeIndex}
          />
        </li>
      ))}
    </ul>
  )
}

type CardData = {
  id: number
  thumbnail: string
  title: string
  channelInfo: string
  updatedTime: string
  isMix?: boolean
  mixLabel?: string
}

const cards: Array<CardData> = [
  {
    id: 1,
    thumbnail:
      "https://i.ytimg.com/vi/sqgxcCjD04s/hqdefault.jpg?sqp=-oaymwEbCKgBEF5IVfKriqkDDggBFQAAiEIYAXABwAEG&rs=AOn4CLAEIWI1cCXpQUZdIpSL-z7k5OIXNQ",
    title: "Mix - 剪 (Cut) - 李沫菲 (Li Mofei), 吉拉石林 (Jila Shilin)...",
    channelInfo: "Zhang Yuan, Li Qi, Shang Wenjie, and more",
    updatedTime: "Updated today",
    isMix: true,
  },
  {
    id: 2,
    thumbnail:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSGAI_yUVIAYj8lT_Bwt7CGdOMU9RygENjHHg&s",
    title: "Lofi Hip Hop Radio - Beats to Relax/Study to",
    channelInfo: "Lofi Girl",
    updatedTime: "Live now",
    isMix: false,
  },
  {
    id: 3,
    thumbnail: "/placeholder.svg?height=94&width=168",
    title: "Top 10 Songs of 2023 - Year End Music Mix",
    channelInfo: "Music Charts",
    updatedTime: "2.5M views • 2 months ago",
    isMix: true,
    mixLabel: "Playlist",
  },
]
