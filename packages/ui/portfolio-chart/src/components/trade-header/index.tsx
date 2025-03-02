import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { Badge } from "some-ui-shared"

type TradeHeaderProps = {
  date: string
  symbol: string
  value: number
}

export const TradeHeader = ({ date, symbol, value }: TradeHeaderProps) => {
  const isGain = value >= 0

  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="text-muted-foreground text-sm">{date}</p>
        <h3 className="mt-1 text-lg font-semibold">{symbol}</h3>
      </div>
      <Badge
        variant={isGain ? "default" : "destructive"}
        className="flex items-center gap-1"
      >
        {isGain ? (
          <ArrowUpIcon className="size-3" />
        ) : (
          <ArrowDownIcon className="size-3" />
        )}
        {isGain ? "+" : ""}
        {value.toFixed(2)}%
      </Badge>
    </div>
  )
}
