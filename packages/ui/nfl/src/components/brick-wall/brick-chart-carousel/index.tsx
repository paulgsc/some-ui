import { useEffect, useRef, useState } from "react"
import { BrickLadderChart } from "@nfl/components/brick-wall/brick-ladder-chart"
import { useNflTennis } from "@nfl/data/brick-data"
import Autoplay from "embla-carousel-autoplay"
import { Carousel, CarouselContent, CarouselItem } from "some-ui-shared"

export const BrickChartCarousel = (): React.JSX.Element => {
  const [d, setDimensions] = useState<Record<"cH" | "cW", number>>({
    cW: 0,
    cH: 0,
  })
  const contentRef = useRef<HTMLDivElement>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const plugin = useRef(Autoplay({ delay: 2000, stopOnInteraction: true }))
  const { data: response, isLoading } = useNflTennis({})
  const { data: allWeeks, metadata } = response ?? {}

  useEffect(() => {
    contentTimerRef.current = setTimeout(() => {
      const domRect = contentRef.current?.getBoundingClientRect()
      if (domRect) {
        setDimensions((prev) => ({
          ...prev,
          cW: domRect.width,
          cH: domRect.height,
        }))
      }
    }, 50)

    return (): void => {
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    }
  }, [])

  if (isLoading) return <div>Loading...</div>

  return (
    <Carousel
      plugins={[plugin.current]}
      className="size-full"
      onMouseEnter={plugin.current.stop}
      onMouseLeave={plugin.current.reset}
    >
      <CarouselContent ref={contentRef}>
        {allWeeks?.map(({ standings }, index) => (
          <CarouselItem
            key={index}
            className="size-full bg-[oklch(75%_0.01_120)] bg-gradient-to-b from-[oklch(75%_0.01_120)] to-[oklch(95%_0.02_180)]"
          >
            <BrickLadderChart
              {...{
                data: standings,
                title: metadata?.title,
                canvasWidth: d.cW,
                canvasHeight: d.cH,
              }}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}
