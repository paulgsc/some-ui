import type { ReactNode } from "react"
import { Fragment } from "react"
import { ScrollingCredits, useGetCredits } from "attributions"
import { BrickChartCarousel } from "some-ui-nfl"
import { getRandomSubarray } from "some-ui-utils"

const EndingCredits = (): React.JSX.Element => {
  const params = {
    range: "Sheet1!A1:G6",
  }
  const { data, isLoading } = useGetCredits({ ...params })
  if (isLoading) return <div>Loading...</div>
  const transform = data?.map(({ source_type, thanks, ...rest }) => ({
    sourceType: source_type,
    thankYouMessage: thanks,
    ...rest,
  }))
  return <ScrollingCredits credits={transform ?? []} />
}

const mainContent: Record<string, Array<ReactNode>> = {
  credits: [<EndingCredits key="credits" />],
  "nfl-tennis": [<BrickChartCarousel key="nfl-tennis" />],
}

export function getMainContent(key: string): ReactNode {
  const content = mainContent[key] ?? []
  if (content.length <= 0) return <Fragment />
  return getRandomSubarray(content, 1)
}
