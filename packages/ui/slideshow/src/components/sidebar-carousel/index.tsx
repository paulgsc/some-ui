import { useEffect, useRef, useState } from "react"
import type { ComponentProps, FC } from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "some-ui-shared"
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
} & ComponentProps<typeof Sidebar>

const SidebarCarousel: FC<SideBarCarouselProps> = ({
  start = 0,
  end = 3,
  className,
  ...props
}): React.JSX.Element => {
  const [items, setItems] = useState<Array<DummyData>>(
    generateDummyData(start, end)
  )
  const observerTarget = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!observerTarget.current) return

    const fetchMoreItems = (): void => {
      if (items.length > 20) return
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
    <Sidebar {...props}>
      <SidebarHeader></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="grid grid-flow-row auto-rows-min gap-y-4">
              {items.map((item) => (
                <SidebarMenuItem
                  key={item.title}
                  className="flex h-48 w-full max-w-xs flex-col items-center justify-center rounded-lg px-1.5 py-0.5 outline outline-2 outline-blue-600"
                >
                  <h3 className="text-lg font-semibold tracking-tight">
                    {item.title}
                  </h3>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            <div ref={observerTarget} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

export default SidebarCarousel
