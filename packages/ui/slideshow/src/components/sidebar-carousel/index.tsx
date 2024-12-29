import { useEffect, useRef, useState } from "react"
import type { FC } from "react"
import { Card, CardContent } from "some-ui-shared"
import { cn } from "some-ui-utils"

type DummyData = {
  id: number
  title: string
  content: string
}

const generateDummyData = (start: number, end: number): Array<DummyData> =>
  Array.from({ length: end - start }, (_, i) => ({
    id: start + 1 + i,
    title: `Item ${start + i}`,
    content: `This is the content for ${start + i}`,
  }))

type SideBarCarouselProps = {
  className?: string
  start?: number
  end?: number
}
const SidebarCarousel: FC<SideBarCarouselProps> = ({
  start = 0,
  end = 3,
  className,
}): React.JSX.Element => {
  const [items, setItems] = useState<Array<DummyData>>(
    generateDummyData(start, end)
  )
  const observerTarget = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!observerTarget.current) return

    const fetchMoreItems = (): void => {
      const lastId = items[items.length - 1].id
      const pgCnt = 3
      const newItems = generateDummyData(lastId + 1, lastId + pgCnt)
      setItems((prevItems) => [...prevItems, ...newItems])
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchMoreItems()
        }
      },
      { threshold: 1.0 }
    )

    const currentTarget = observerTarget.current
    observer.observe(currentTarget)

    return (): void => {
      observer.unobserve(currentTarget)
    }
  }, [items])

  return (
    <aside className={cn("", className)}>
      {items.map((item) => (
        <Card key={item.id} className="h-52 w-full rounded-md">
          <CardContent className="">
            <h3 className="text-lg font-semibold tracking-tight">
              {item.title}
            </h3>
          </CardContent>
        </Card>
      ))}

      <div ref={observerTarget} />
    </aside>
  )
}

export default SidebarCarousel
