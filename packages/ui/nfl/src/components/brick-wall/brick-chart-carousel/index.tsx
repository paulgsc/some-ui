import type { ComponentProps, FC, ReactNode } from "react"
import { useRef } from "react"
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
  [key: string]: unknown // Allow extra metadata
}

export type BrickChartCarouselProps = {
  data: Array<BrickChartData>
  title?: string
  isLoading?: boolean
  /**
   * Optional autoplay delay in ms
   * @default 2000
   */
  autoplayDelay?: number
  /**
   * Whether to stop autoplay on user interaction
   * @default true
   */
  stopOnInteraction?: boolean
  /**
   * Custom loader component while loading
   */
  loader?: ReactNode
  /**
   * Additional props to pass to BrickWallChart
   */
  chartProps?: Omit<ComponentProps<typeof BrickWallChart>, "data" | "title">
}

/**
 * A reusable carousel component for displaying brick wall charts (e.g., ladder/standings).
 * Designed for dynamic data input — ideal for integration in NPM packages.
 */
export const BrickChartCarousel: FC<BrickChartCarouselProps> = ({
  data,
  title,
  isLoading = false,
  autoplayDelay = 2000,
  stopOnInteraction = true,
  loader = <div>Loading...</div>,
  chartProps,
}): React.JSX.Element => {
  const plugin = useRef(Autoplay({ delay: autoplayDelay, stopOnInteraction }))

  if (isLoading) return <>{loader}</>

  if (!data || data.length === 0) {
    return <></> // or a fallback UI
  }

  return (
    <Carousel
      plugins={[plugin.current]}
      className="size-full"
      onMouseEnter={stopOnInteraction ? plugin.current.stop : undefined}
      onMouseLeave={plugin.current.reset}
    >
      <CarouselContent>
        {data.map((item, index) => (
          <CarouselItem
            key={index}
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
