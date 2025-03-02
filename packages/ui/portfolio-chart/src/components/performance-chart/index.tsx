import { useEffect, useRef } from "react"
import { useChartAnimation } from "@portfolio-chart/hooks/use-chart-animation"
import {
  calculateRegressionLine,
  smoothRegressionLine,
} from "@portfolio-chart/lib/chart-utils"
import { renderAxes } from "@portfolio-chart/lib/render-axes"
import { renderBars } from "@portfolio-chart/lib/render-bars"
import { renderRegressionLine } from "@portfolio-chart/lib/render-regression-line"
import type { TradeData } from "@portfolio-chart/types/trade-data"
import * as d3 from "d3"

type PerformanceChartProps = {
  tradeData: Array<TradeData>
  currentIndex: number
}

export const PerformanceChart = ({
  tradeData,
  currentIndex,
}: PerformanceChartProps): React.JSX.Element => {
  const svgRef = useRef<SVGSVGElement>(null)
  const { chartOpacity } = useChartAnimation(currentIndex, tradeData.length)

  useEffect(() => {
    if (!svgRef.current || tradeData.length === 0) return

    const margin = { top: 20, right: 30, bottom: 30, left: 50 }
    const width = 800 - margin.left - margin.right
    const height = 400 - margin.top - margin.bottom

    const visibleData = tradeData
      .slice(0, currentIndex + 1)
      .map((trade, index) => ({
        ...trade,
        index,
        gain: trade.value >= 0 ? trade.value : 0,
        loss: trade.value < 0 ? trade.value : 0,
      }))

    const regressionPoints = calculateRegressionLine(visibleData)
    const smoothedRegression = smoothRegressionLine(regressionPoints, 5)

    const xScale = d3
      .scaleBand()
      .domain(visibleData.map((d) => d.date))
      .range([0, width])
      .padding(0.2)

    const yMin = d3.min(visibleData, (d) => d.value) || 0
    const yMax = d3.max(visibleData, (d) => d.value) || 0
    const yScale = d3
      .scaleLinear()
      .domain([Math.min(yMin, 0), Math.max(yMax, 0)]) // Ensures 0 is included in the range
      .range([height, 0])

    const svg = d3
      .select(svgRef.current)
      .attr(
        "viewBox",
        `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`
      )

    svg.selectAll("*").remove()

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    // Render Axes
    renderAxes(g, xScale, yScale)
    // Render Bars
    renderBars(g, xScale, yScale, visibleData)
    // Render Regression Line
    renderRegressionLine(g, xScale, yScale, smoothedRegression, visibleData)
  }, [tradeData, currentIndex])

  return (
    <div
      className="size-full transition-opacity duration-500 ease-in-out"
      style={{ opacity: chartOpacity }}
    >
      <svg ref={svgRef} className="size-full"></svg>
    </div>
  )
}
