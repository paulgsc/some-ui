import type { FC, ReactNode } from "react"
import { useCallback, useEffect, useRef } from "react"
import { ClueList } from "@input/components/clues-list"
import { useFetchViewportWasm } from "@input/hooks/use-viewport-rotation-wasm"
import type { CrosswordClue } from "@input/types/crossword"
import { DiceCard } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

const cards: Array<CrosswordClue> = [
  {
    id: "item1",
    thumbnail:
      "https://i.ytimg.com/vi/sqgxcCjD04s/hqdefault.jpg?sqp=-oaymwEbCKgBEF5IVfKriqkDDggBFQAAiEIYAXABwAEG&rs=AOn4CLAEIWI1cCXpQUZdIpSL-z7k5OIXNQ",
    title: "Mix - 剪 (Cut) - 李沫菲 (Li Mofei), 吉拉石林 (Jila Shilin)...",
    channelInfo: "Zhang Yuan, Li Qi, Shang Wenjie, and more",
    updatedTime: "face 1",
    isMix: true,
  },
  {
    id: "item2",
    thumbnail:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSGAI_yUVIAYj8lT_Bwt7CGdOMU9RygENjHHg&s",
    title: "Lofi Hip Hop Radio - Beats to Relax/Study to",
    channelInfo: "Lofi Girl",
    updatedTime: "face 2",
    isMix: false,
  },
  {
    id: "item3",
    thumbnail: "/placeholder.svg?height=94&width=168",
    title: "Top 10 Songs of 2023 - Year End Music Mix",
    channelInfo: "Music Charts",
    updatedTime: "face 3",
    isMix: true,
    mixLabel: "Playlist",
  },
  {
    id: "item4",
    thumbnail:
      "https://i.ytimg.com/vi/sqgxcCjD04s/hqdefault.jpg?sqp=-oaymwEbCKgBEF5IVfKriqkDDggBFQAAiEIYAXABwAEG&rs=AOn4CLAEIWI1cCXpQUZdIpSL-z7k5OIXNQ",
    title: "Mix - 剪 (Cut) - 李沫菲 (Li Mofei), 吉拉石林 (Jila Shilin)...",
    channelInfo: "Zhang Yuan, Li Qi, Shang Wenjie, and more",
    updatedTime: "face 4",
    isMix: true,
  },
  {
    id: "item5",
    thumbnail:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSGAI_yUVIAYj8lT_Bwt7CGdOMU9RygENjHHg&s",
    title: "Lofi Hip Hop Radio - Beats to Relax/Study to",
    channelInfo: "Lofi Girl",
    updatedTime: "face 5",
    isMix: false,
  },
  {
    id: "item6",
    thumbnail: "/placeholder.svg?height=94&width=168",
    title: "Top 10 Songs of 2023 - Year End Music Mix",
    channelInfo: "Music Charts",
    updatedTime: "face 6",
    isMix: true,
    mixLabel: "Playlist",
  },
]

type ClueCarouselProps = {
  className?: string
}

export const ClueCarousel: FC<ClueCarouselProps> = ({ className }) => {
  const { isLoading, error, rotationState, getNextItem } = useFetchViewportWasm(
    {
      totalItems: cards.length,
      maxPerFace: 3,
    }
  )

  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const getClues = useCallback(() => {
    if (!rotationState) return []

    const { faceIndices, currFace, currIdx, pendingCount } = rotationState

    return faceIndices.map((indices, i) => {
      const clues = indices.map((indice) => cards[indice])
      const args = {
        key: `crossword_clues_${i}`,
        clues,
        isActive: currFace === i,
        activeIndex: currIdx,
      }
      const { key, ...rest } = args
      return <ClueList key={key} {...rest} />
    })
  }, [rotationState])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      getNextItem()
    }, 3000)

    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [getNextItem])

  console.log("this ran how many times!")
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  if (!rotationState) return <div> never began!</div>

  return (
    <DiceCard
      className={cn("size-full", className)}
      dof={"X-axis"}
      mode={"manual"}
      faces={getClues()}
    />
  )
}
