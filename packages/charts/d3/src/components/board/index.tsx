import React, { useEffect, useRef } from "react"
import { Grid, defineHex, rectangle } from "honeycomb-grid"

const HoneycombGrid = () => {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d")

      // 1. Create a hex class:
      const Tile = defineHex({ dimensions: 30 })

      // 2. Create a grid by passing the class and a "traverser" for a rectangular-shaped grid:
      const grid = new Grid(Tile, rectangle({ width: 10, height: 10 }))

      // 3. Iterate over the grid to draw each hex:
      grid.forEach((hex) => {
        const { x, y } = hex
        const corners = hex.corners

        ctx.beginPath()
        ctx.moveTo(x + corners[5].x, y + corners[5].y)
        for (let i = 0; i < 6; i++) {
          ctx.lineTo(x + corners[i].x, y + corners[i].y)
        }
        ctx.closePath()
        ctx.stroke()

        // Optionally, you can add text to show coordinates
        ctx.fillText(`${hex.q},${hex.r}`, x, y)
      })
    }
  }, [])

  return (
    <div>
      <h2>Honeycomb Grid Example</h2>
      <canvas
        ref={canvasRef}
        width={600}
        height={600}
        style={{ border: "1px solid black" }}
      />
    </div>
  )
}

export default HoneycombGrid
