import { Card, CardContent, CardHeader, CardTitle } from "some-ui-shared"

type ChartContainerProps = {
  title: string
  chart: React.ReactNode
  infoCard?: React.ReactNode
  controls: React.ReactNode
}

export const ChartContainer = ({
  title,
  chart,
  infoCard,
  controls,
}: ChartContainerProps): React.JSX.Element => {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-[400px] md:h-[500px]">
          {chart}
          {infoCard && (
            <div className="absolute inset-x-4 top-4 z-10">{infoCard}</div>
          )}
        </div>
        <div className="mt-6">{controls}</div>
      </CardContent>
    </Card>
  )
}
