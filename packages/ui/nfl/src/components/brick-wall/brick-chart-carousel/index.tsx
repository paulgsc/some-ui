import type { ComponentProps, FC, JSX, ReactNode } from "react"
import { useCallback, useMemo } from "react"
import { BrickWallChart } from "@nfl/components/brick-wall/brick-ladder-chart"
import Autoplay from "embla-carousel-autoplay"
import { Carousel, CarouselContent, CarouselItem } from "some-ui-shared"

type Standing = {
  name: string
  value: number
  imageUrl: string
  properties?: Record<string, string | number | object>
}

export type BrickChartData = {
  standings: Array<Standing>
  weekLabel?: string
  id?: string
  [key: string]: unknown
}

export type BrickChartCarouselProps = {
  data: Array<BrickChartData>
  title?: string
  isLoading?: boolean
  autoplayDelay?: number
  stopOnInteraction?: boolean
  loader?: ReactNode
  chartProps?: Omit<ComponentProps<typeof BrickWallChart>, "data" | "title">
}

export const BrickChartCarousel: FC<BrickChartCarouselProps> = ({
  data,
  title,
  isLoading = false,
  autoplayDelay = 2000,
  stopOnInteraction = true,
  loader = <div>Loading...</div>,
  chartProps,
}): JSX.Element | null => {
  const autoplay = useMemo(
    () =>
      Autoplay({
        delay: autoplayDelay,
        stopOnInteraction,
      }),
    [autoplayDelay, stopOnInteraction]
  )

  const handleMouseEnter = useCallback(() => {
    if (stopOnInteraction) {
      autoplay.stop()
    }
  }, [autoplay, stopOnInteraction])

  const handleMouseLeave = useCallback(() => {
    autoplay.reset()
  }, [autoplay])

  if (isLoading) {
    return <>{loader}</>
  }

  if (data.length === 0) {
    return null
  }

  return (
    <Carousel
      plugins={[autoplay]}
      className="size-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <CarouselContent>
        {data.map((item) => (
          <CarouselItem
            key={item.id ?? item.weekLabel ?? JSON.stringify(item.standings)}
            className="size-full bg-[oklch(75%_0.01_120)] bg-gradient-to-b from-[oklch(75%_0.01_120)] to-[oklch(95%_0.02_180)]"
          >
            <BrickWallChart
              data={item.standings}
              title={title}
              {...chartProps}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}

BrickChartCarousel.displayName = "BrickChartCarousel"
