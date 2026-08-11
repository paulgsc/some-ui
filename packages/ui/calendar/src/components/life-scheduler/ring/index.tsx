import type { JSX } from "react"
import { useCallback, useEffect, useRef } from "react"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"

export type RingHit = {
  type: "outer" | "inner"
  index: number
}

type Props = {
  outerPos: number
  innerPos: number
  onHit: (hit: RingHit) => void
  /**
   * Art direction. `inherit` — the default — renders in whatever theme the
   * host established. Pass `"scheduler"` to opt into the standalone scheduler
   * palette, which replaces the substrate for this subtree.
   */
  appearance?: Appearance
}

// Configuration Constants
const N24 = 24
const N60 = 60
const W = 520
const H = 520
const CX = W / 2
const CY = H / 2
const R24_O = 222
const R24_I = 180
const R60_O = 160
const R60_I = 116
const r24 = 14
const r60 = 8

// Mapping the original COL object to Hex/RGBA for the Canvas API
const THEME = {
  track: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.10)",
  muted: "#6b6865",
  bg2: "#1e1d1c",
  violet: "#8b7cf8",
  violetPast: "#4a3fa0",
  emerald: "#34d399",
  emeraldPast: "#065f46",
}

export const Rings = ({
  outerPos,
  innerPos,
  onHit,
  appearance = "inherit",
}: Props): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const ang24 = (i: number): number => -Math.PI / 2 + (i / N24) * 2 * Math.PI
  const ang60 = (i: number): number => -Math.PI / 2 + (i / N60) * 2 * Math.PI
  const pt = (r: number, a: number): [number, number] => [
    CX + r * Math.cos(a),
    CY + r * Math.sin(a),
  ]

  const draw = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")!
    ctx.clearRect(0, 0, W, H)

    const t24 = (R24_O + R24_I) / 2
    const w24 = R24_O - R24_I
    const t60 = (R60_O + R60_I) / 2
    const w60 = R60_O - R60_I

    // --- Tracks ---
    ctx.lineWidth = w24 + 4
    ctx.strokeStyle = THEME.track
    ctx.beginPath()
    ctx.arc(CX, CY, t24, 0, Math.PI * 2)
    ctx.stroke()

    ctx.lineWidth = w60 + 4
    ctx.beginPath()
    ctx.arc(CX, CY, t60, 0, Math.PI * 2)
    ctx.stroke()

    // --- Phase Arcs ---
    ctx.globalAlpha = 0.12
    ctx.lineWidth = w24 - 6
    ctx.strokeStyle = THEME.violet
    ctx.beginPath()
    ctx.arc(
      CX,
      CY,
      t24,
      -Math.PI / 2,
      ang24(outerPos) + ((Math.PI * 2) / N24) * 0.5
    )
    ctx.stroke()

    ctx.lineWidth = w60 - 4
    ctx.strokeStyle = THEME.emerald
    ctx.beginPath()
    ctx.arc(
      CX,
      CY,
      t60,
      -Math.PI / 2,
      ang60(innerPos) + ((Math.PI * 2) / N60) * 0.5
    )
    ctx.stroke()
    ctx.globalAlpha = 1

    // --- Outer Nodes (24) ---
    for (let i = 0; i < N24; i++) {
      const a = ang24(i)
      const [x, y] = pt(t24, a)
      const active = i === outerPos
      const past = i < outerPos

      ctx.beginPath()
      ctx.arc(x, y, r24, 0, Math.PI * 2)
      ctx.fillStyle = active
        ? THEME.violet
        : past
          ? THEME.violetPast
          : THEME.bg2
      ctx.fill()
      ctx.strokeStyle = active ? THEME.violet : THEME.border
      ctx.lineWidth = active ? 2 : 0.5
      ctx.stroke()

      // Tick mark
      const [tx1, ty1] = pt(R24_O + 7, a)
      const [tx2, ty2] = pt(R24_O + 14, a)
      ctx.beginPath()
      ctx.moveTo(tx1, ty1)
      ctx.lineTo(tx2, ty2)
      ctx.strokeStyle = active ? THEME.violet : THEME.muted
      ctx.lineWidth = active ? 2 : 0.5
      ctx.stroke()

      ctx.fillStyle = active ? "#fff" : past ? "#a89fe8" : THEME.muted
      ctx.font = `${active ? "600" : "400"} ${active ? 11 : 10}px 'JetBrains Mono', monospace`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(i), x, y)
    }

    // --- Inner Nodes (60) ---
    for (let i = 0; i < N60; i++) {
      const a = ang60(i)
      const [x, y] = pt(t60, a)
      const active = i === innerPos
      const past = i < innerPos

      ctx.beginPath()
      ctx.arc(x, y, r60, 0, Math.PI * 2)
      ctx.fillStyle = active
        ? THEME.emerald
        : past
          ? THEME.emeraldPast
          : THEME.bg2
      ctx.fill()
      ctx.strokeStyle = active ? THEME.emerald : THEME.border
      ctx.lineWidth = active ? 1.5 : 0.5
      ctx.stroke()

      if (active || i % 5 === 0) {
        ctx.fillStyle = active ? "#121110" : THEME.muted
        ctx.font = `${active ? "600" : "400"} ${active ? 9 : 8}px 'JetBrains Mono', monospace`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(String(i), x, y)
      }
    }

    // --- Center Readout ---
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    ctx.fillStyle = THEME.violet
    ctx.font = "600 30px 'JetBrains Mono', monospace"
    ctx.fillText(String(outerPos).padStart(2, "0"), CX, CY - 18)

    ctx.fillStyle = THEME.muted
    ctx.font = "400 10px 'DM Sans', sans-serif"
    ctx.fillText("outer", CX, CY - 2)

    ctx.fillStyle = THEME.emerald
    ctx.font = "600 20px 'JetBrains Mono', monospace"
    ctx.fillText(String(innerPos).padStart(2, "0"), CX, CY + 17)

    ctx.fillStyle = THEME.muted
    ctx.font = "400 10px 'DM Sans', sans-serif"
    ctx.fillText("inner", CX, CY + 31)
  }, [outerPos, innerPos])

  useEffect(() => {
    draw()
  }, [draw])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const c = canvasRef.current!
      const rect = c.getBoundingClientRect()
      const sx = W / rect.width
      const sy = H / rect.height
      const mx = (e.clientX - rect.left) * sx - CX
      const my = (e.clientY - rect.top) * sy - CY
      const dist = Math.sqrt(mx * mx + my * my)
      const t24 = (R24_O + R24_I) / 2
      const t60 = (R60_O + R60_I) / 2

      if (Math.abs(dist - t24) < r24 + 10) {
        for (let i = 0; i < N24; i++) {
          const a = ang24(i)
          const [x, y] = pt(t24, a)
          if ((x - CX - mx) ** 2 + (y - CY - my) ** 2 < (r24 + 10) ** 2) {
            onHit({
              type: "outer",
              index: i,
            })
            return
          }
        }
      }
      if (Math.abs(dist - t60) < r60 + 10) {
        for (let i = 0; i < N60; i++) {
          const a = ang60(i)
          const [x, y] = pt(t60, a)
          if ((x - CX - mx) ** 2 + (y - CY - my) ** 2 < (r60 + 10) ** 2) {
            onHit({
              type: "inner",
              index: i,
            })
            return
          }
        }
      }
    },
    [onHit]
  )

  return (
    <div
      className={`${appearanceClassName(appearance)} flex items-center justify-center w-full p-4`.trim()}
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={handleClick}
        className="block w-full max-w-[520px] aspect-square cursor-crosshair transition-opacity duration-300 hover:opacity-90"
      />
    </div>
  )
}
