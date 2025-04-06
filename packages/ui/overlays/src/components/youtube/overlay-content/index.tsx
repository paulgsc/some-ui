import type { ReactNode } from "react"
import { Fragment } from "react"
import { ScrollingCredits, useGetCredits } from "attributions"
import { BrickLadderChart, useNflTennis } from "some-ui-nfl"
import { getRandomSubarray } from "some-ui-utils"

const EndingCredits = () => {
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

const NflTennis = () => {
  const params = {
    range: "testing!A1:J33",
  }
  const { data: response, isLoading } = useNflTennis({ ...params })
  const { data: points, metadata } = response ?? {}
  if (isLoading) return <div>Loading...</div>
  return (
    <BrickLadderChart {...{ data: points ?? [], title: metadata?.title }} />
  )
}

const mainContent: Record<string, Array<ReactNode>> = {
  credits: [<EndingCredits key="credits" />],
  "nfl-tennis": [<NflTennis key="nfl-tennis" />],
}

export function getMainContent(key: string): ReactNode {
  const content = mainContent[key] ?? []
  if (content.length <= 0) return <Fragment />
  return getRandomSubarray(content, 1)
}
