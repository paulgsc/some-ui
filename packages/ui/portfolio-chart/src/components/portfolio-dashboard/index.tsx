import { useEffect, useState } from "react"
import { ChartContainer } from "@portfolio-chart/components/chart-container"
import { ChartControls } from "@portfolio-chart/components/chart-controls"
import { TradeInfoCard } from "@portfolio-chart/components/info-card"
import { PerformanceChart } from "@portfolio-chart/components/performance-chart"
import { PortfolioSummary } from "@portfolio-chart/components/portfolio-summary"
import { useTradeData } from "@portfolio-chart/hooks/use-trade-data"
import { calculateRegressionLine } from "@portfolio-chart/lib/chart-utils"
import type { TradeData } from "@portfolio-chart/types/trade-data"

type PortfolioDashboardProps = {
  data: Array<TradeData>
}

export const PortfolioDashboard = ({
  data,
}: PortfolioDashboardProps): React.JSX.Element => {
  const {
    tradeData,
    currentIndex,
    isPlaying,
    totalGain,
    playAnimation,
    pauseAnimation,
    resetAnimation,
    nextTrade,
    previousTrade,
  } = useTradeData({ data })

  const [regressionData, setRegressionData] = useState<
    Array<{ x: number; y: number }>
  >([])

  // Calculate regression line whenever trade data changes
  useEffect(() => {
    if (tradeData.length > 0 && currentIndex >= 0) {
      const visibleData = tradeData.slice(0, currentIndex + 1)
      setRegressionData(calculateRegressionLine(visibleData))
    }
  }, [tradeData, currentIndex])

  const currentTrade = currentIndex >= 0 ? tradeData[currentIndex] : null

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <ChartContainer
        title="Performance History"
        chart={
          <PerformanceChart
            tradeData={tradeData}
            currentIndex={currentIndex}
            regressionData={regressionData}
          />
        }
        infoCard={
          currentTrade && (
            <TradeInfoCard
              trade={currentTrade}
              isVisible={currentIndex >= 0}
              opacity={currentIndex >= 0 ? 1 : 0}
            />
          )
        }
        controls={
          <ChartControls
            isPlaying={isPlaying}
            currentIndex={currentIndex}
            totalTrades={tradeData.length}
            onReset={resetAnimation}
            onPlayPause={isPlaying ? pauseAnimation : playAnimation}
            onPrevious={previousTrade}
            onNext={nextTrade}
          />
        }
      />

      <PortfolioSummary
        totalTrades={tradeData.length}
        currentTradeIndex={currentIndex}
        totalGain={totalGain}
        winRate={
          (tradeData.filter((t) => t.value > 0).length /
            Math.max(1, tradeData.length)) *
          100
        }
      />
    </div>
  )
}
