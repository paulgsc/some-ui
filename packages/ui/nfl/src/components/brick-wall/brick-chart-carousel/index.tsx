import { useRef } from "react"
import { BrickLadderChart } from "@nfl/components/brick-wall/brick-ladder-chart"
import { useNflTennis } from "@nfl/data/brick-data"
import Autoplay from "embla-carousel-autoplay"
import { Carousel, CarouselContent, CarouselItem } from "some-ui-shared"

export const BrickChartCarousel = (): React.JSX.Element => {
  const plugin = useRef(Autoplay({ delay: 2000, stopOnInteraction: true }))
  const { data: response, isLoading } = useNflTennis({})
  const { data: allWeeks, metadata } = response ?? {}
  if (isLoading) return <div>Loading...</div>

  return (
    <Carousel
      plugins={[plugin.current]}
      className="size-full"
      onMouseEnter={plugin.current.stop}
      onMouseLeave={plugin.current.reset}
    >
      <CarouselContent>
        {allWeeks?.map(({ standings }, index) => (
          <CarouselItem
            key={index}
            className="size-full bg-[oklch(75%_0.01_120)] bg-gradient-to-b from-[oklch(75%_0.01_120)] to-[oklch(95%_0.02_180)]"
          >
            <BrickLadderChart
              {...{ data: standings, title: metadata?.title }}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}
