import { useGetCredits } from "@content/data/attributions"
import { ScrollingCredits } from "attributions"

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

export default EndingCredits
