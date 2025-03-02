import { useEffect, useRef } from "react"
import { useChartAnimation } from "@portfolio-chart/hooks/use-chart-animation"
import {
  calculateRegressionLine,
  smoothRegressionLine,
} from "@portfolio-chart/lib/chart-utils"
import type { TradeData } from "@portfolio-chart/types/trade-data"
import * as d3 from "d3"

type PerformanceChartProps = {
  tradeData: Array<TradeData>
  currentIndex: number
}

export const PerformanceChart = ({
  tradeData,
  currentIndex,
}: PerformanceChartProps) => {
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
        formattedValue: trade.value,
        gain: trade.value >= 0 ? trade.value : 0,
        loss: trade.value < 0 ? trade.value : 0,
      }))

    const regressionPoints = calculateRegressionLine(visibleData)
    const smoothedRegression = smoothRegressionLine(regressionPoints, 5)

    const minY = d3.min(visibleData, (d) => d.value) || 0
    const maxY = d3.max(visibleData, (d) => d.value) || 0

    const xScale = d3
      .scaleBand()
      .domain(visibleData.map((d) => d.date))
      .range([0, width])
      .padding(0.2)

    const yScale = d3.scaleLinear().domain([minY, maxY]).range([height, 0])

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

    renderAxes(g, xScale, yScale, height)
    renderBars(g, visibleData, xScale, yScale, height)
    renderRegressionLine(g, smoothedRegression, xScale, yScale, visibleData)
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

// Helper function to render axes
function renderAxes(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>,
  height: number
) {
  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3.axisBottom(xScale).tickFormat((d) => {
        const date = new Date(d)
        return `${date.getMonth() + 1}/${date.getDate()}`
      })
    )

  g.append("g").call(d3.axisLeft(yScale).tickFormat((d) => `${d}%`))
}

// Helper function to render bars
function renderBars(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: Array<any>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>,
  height: number
) {
  g.selectAll(".bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => xScale(d.date)!)
    .attr("y", (d) => (d.value >= 0 ? yScale(d.value) : yScale(0)))
    .attr("width", xScale.bandwidth())
    .attr("height", (d) => Math.abs(yScale(d.value) - yScale(0)))
    .attr("fill", (d) =>
      d.value >= 0 ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)"
    )
    .attr("stroke", (d) =>
      d.value >= 0 ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
    )
    .attr("rx", 4)
}

// Helper function to render regression line
function renderRegressionLine(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  regressionData: Array<{ x: number; y: number }>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>,
  visibleData: Array<any>
) {
  const line = d3
    .line<{ x: number; y: number }>()
    .x((d) => xScale(visibleData[d.x]?.date) || 0)
    .y((d) => yScale(d.y))
    .curve(d3.curveCardinal.tension(0.5))

  g.append("path")
    .datum(regressionData)
    .attr("fill", "none")
    .attr("stroke", "rgb(249, 115, 22)")
    .attr("stroke-width", 2)
    .attr("d", line)
}
