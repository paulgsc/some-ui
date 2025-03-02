import { GainLossBox } from "@portfolio-chart/components/gain-loss-box"
import { Card, CardContent, CardHeader, CardTitle } from "some-ui-shared"

type PortfolioSummaryProps = {
  totalTrades: number
  currentTradeIndex: number
  totalGain: number
  winRate: number
}

export const PortfolioSummary = ({
  totalTrades,
  currentTradeIndex,
  totalGain,
  winRate,
}: PortfolioSummaryProps): React.JSX.Element => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SummaryBox label="Total Trades" value={totalTrades.toString()} />
            <SummaryBox
              label="Current Trade"
              value={(currentTradeIndex + 1 || 0).toString()}
            />
            <GainLossBox
              label="Total Gain/Loss"
              value={`${totalGain >= 0 ? "+" : ""}${totalGain.toFixed(2)}%`}
              isPositive={totalGain >= 0}
            />
            <SummaryBox label="Win Rate" value={`${winRate.toFixed(1)}%`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

type SummaryBoxProps = {
  label: string
  value: string
}

const SummaryBox = ({ label, value }: SummaryBoxProps): React.JSX.Element => {
  return (
    <div className="bg-muted rounded-lg p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
