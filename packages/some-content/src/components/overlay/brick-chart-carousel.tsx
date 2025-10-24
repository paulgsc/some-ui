import { useNflTennis } from "@some-ui/content"
import { BrickChartCarousel } from "some-ui-nfl"

const BrickChartCarouselComponent = (): React.JSX.Element => {
  const { data: response, isLoading } = useNflTennis({})
  const { data: allWeeks, metadata } = response ?? {}
  return (
    <BrickChartCarousel
      data={allWeeks ?? []}
      title={metadata?.title}
      isLoading={isLoading}
      autoplayDelay={2000}
      stopOnInteraction={true}
    />
  )
}

export default BrickChartCarouselComponent
