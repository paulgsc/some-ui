import type { TradeData } from "@portfolio-chart/types/trade-data"
import type * as d3 from "d3"

export function renderBars(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>,
  data: Array<TradeData>
): void {
  g.selectAll(".bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => xScale(d.date)!)
    .attr("y", (d) => (d.value >= 0 ? yScale(d.value) : yScale(0))) // Gains start from top, losses from y=0
    .attr("width", xScale.bandwidth())
    .attr("height", (d) => Math.abs(yScale(d.value) - yScale(0))) // Ensure losses go below x-axis
    .attr("fill", (d) =>
      d.value >= 0 ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)"
    )
    .attr("stroke", (d) =>
      d.value >= 0 ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
    )
    .attr("rx", 4)
}
