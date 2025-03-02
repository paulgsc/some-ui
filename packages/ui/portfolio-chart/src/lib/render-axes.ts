import * as d3 from "d3"

export function renderAxes(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  xScale: d3.ScaleBand<string>,
  yScale: d3.ScaleLinear<number, number>
): void {
  g.append("g")
    .attr("transform", `translate(0,${yScale(0)})`) // X-axis at y=0
    .call(
      d3.axisBottom(xScale).tickFormat((d) => {
        const date = new Date(d)
        return `${date.getMonth() + 1}/${date.getDate()}`
      })
    )

  g.append("g").call(
    d3.axisLeft(yScale).tickFormat((d) => {
      const value = typeof d === "object" ? d.valueOf() : d
      return `${value satisfies number}%`
    })
  )
}
