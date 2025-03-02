import { useEffect, useState } from "react"
import { TradeDetails } from "@portfolio-chart/components/trade-details"
import { TradeHeader } from "@portfolio-chart/components/trade-header"
import type { TradeData } from "@portfolio-chart/types/trade-data"
import { Badge, Card, CardContent } from "some-ui-shared"

type TradeInfoCardProps = {
  trade: TradeData
  isVisible: boolean
  opacity: number
}

export const TradeInfoCard = ({
  trade,
  isVisible,
  opacity,
}: TradeInfoCardProps) => {
  const [isVisible2, setIsVisible2] = useState(false)

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        setIsVisible2(true)
      }, 300)
      return () => clearTimeout(timer)
    }
    setIsVisible2(false)
  }, [isVisible])

  if (!isVisible) return null

  return (
    <Card
      className="bg-white/90 shadow-lg backdrop-blur-sm transition-opacity duration-500 dark:bg-gray-900/90"
      style={{ opacity: opacity }}
    >
      <CardContent className="p-4">
        <TradeHeader
          date={trade.date}
          symbol={trade.symbol}
          value={trade.value}
        />
        <TradeDetails
          logic={trade.logic}
          evaluation={trade.evaluation}
          nextStrategy={trade.nextStrategy}
        />
      </CardContent>
    </Card>
  )
}
