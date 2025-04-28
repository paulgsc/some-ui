import type { FC, ReactNode } from "react"
import { useEffect, useState } from "react"
import { ClueList } from "@input/components/clues-list"
import { ClueCard } from "@input/components/crossword-clue"
import { useFetchViewportWasm } from "@input/hooks/use-viewport-rotation-wasm"
import type { CrosswordClue } from "@input/types/crossword"
import { DiceCard } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

const cards: Array<CrosswordClue> = [
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

type FaceContent = Record<string, ReactNode>
type ClueCarouselProps = {
  className?: string
}

export const ClueCarousel: FC<ClueCarouselProps> = ({ className }) => {
  const faces: FaceContent = cards.reduce(
    (acc, curr, i) => ({
      ...acc,
      [`faceItem_${i}`]: (
        <ClueCard
          key={i}
          thumbnail={curr.thumbnail}
          title={curr.title}
          clue={curr.channelInfo}
          updatedTime={curr.updatedTime}
          isActive={i === 0}
        />
      ),
    }),
    {}
  )

  const { isLoading, error, rotationState, rotateNext, getFaceItemIds } =
    useFetchViewportWasm({
      itemIds: Object.keys(faces),
      maxPerFace: 4,
    })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!rotationState) return <div> never began!</div>

  return (
    <DiceCard
      className={cn("size-full", className)}
      dof={"X-axis"}
      mode={"manual"}
      faces={Array(6).fill(<ClueList />)}
    />
  )
}
