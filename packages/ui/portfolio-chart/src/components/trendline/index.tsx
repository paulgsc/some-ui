import { curveCardinal } from "d3-shape"

export const Trendline = (props: any) => {
  const { points } = props
  const lineGenerator = curveCardinal.tension(0.5)

  let d = "M"
  lineGenerator.lineStart()
  points.forEach((point: any, index: number) => {
    if (index === 0) {
      d += `${point.x},${point.y}`
    } else {
      lineGenerator.point(point.x, point.y)
      if (index === 1) {
        d += lineGenerator.line().slice(1)
      } else {
        d += lineGenerator.line()
      }
    }
  })

  return <path d={d} fill="none" stroke="rgb(249, 115, 22)" strokeWidth={2} />
}
