import type { RefObject } from "react"
import { useMemo, useRef } from "react"
import { ContentTooltip } from "@portfolio-chart/components/content-tooltip"
import { Trendline } from "@portfolio-chart/components/trendline"
import { useChartAnimation } from "@portfolio-chart/hooks/use-chart-animation"
import {
  calculateRegressionLine,
  smoothRegressionLine,
} from "@portfolio-chart/lib/chart-utils"
import type { TradeData } from "@portfolio-chart/types/trade-data"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { ChartConfig } from "some-ui-shared"
import { ChartContainer } from "some-ui-shared"
import { useMeasureRect } from "some-ui-utils"

type PerformanceChartProps = {
  tradeData: Array<TradeData>
  currentIndex: number
}

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

export const PerformanceChart = ({
  tradeData,
  currentIndex,
}: PerformanceChartProps) => {
  const ref = useRef<HTMLDivElement>(null)

  const { height, width } = useMeasureRect({
    ref: ref as RefObject<HTMLElement>,
  })
  const { chartOpacity } = useChartAnimation(currentIndex, tradeData.length)

  const visibleData = useMemo(() => {
    const data = tradeData.slice(0, currentIndex + 1).map((trade, index) => ({
      ...trade,
      index,
      formattedValue: trade.value,
      gain: trade.value >= 0 ? trade.value : 0,
      loss: trade.value < 0 ? trade.value : 0,
    }))

    // Calculate regression line
    const regressionPoints = calculateRegressionLine(data)
    const smoothedRegression = smoothRegressionLine(regressionPoints, 5)

    // Merge regression data with trade data
    return data.map((item, index) => ({
      ...item,
      regressionValue: smoothedRegression[index]?.y || null,
    }))
  }, [tradeData, currentIndex])

  return (
    <div
      ref={ref}
      className="size-full border border-red-500 transition-opacity duration-500 ease-in-out"
      style={{ opacity: chartOpacity }}
    >
      <ChartContainer config={chartConfig}>
        <BarChart
          data={visibleData}
          height={height}
          width={width}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <Legend />
          <ReferenceLine y={0} stroke="#666" />
          <Bar
            dataKey="gain"
            fill="rgba(34, 197, 94, 0.6)"
            stroke="rgb(34, 197, 94)"
            radius={[4, 4, 0, 0]}
            minPointSize={0}
          />
          <Bar
            dataKey="loss"
            fill="rgba(239, 68, 68, 0.6)"
            stroke="rgb(239, 68, 68)"
            radius={[4, 4, 0, 0]}
            minPointSize={0}
          />
          <Line
            type="monotone"
            dataKey="regressionValue"
            name="Trend"
            stroke="rgb(249, 115, 22)"
            strokeWidth={2}
            dot={{ fill: "black", r: 4 }}
            activeDot={{ r: 6 }}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
