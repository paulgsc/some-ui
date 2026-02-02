import type { MutableRefObject, RefObject } from "react"
import { useEffect, useRef } from "react"
import { hexToRgb } from "@umag/utils/color-utils"

type Theme = {
  color: string
}

type BlinkState = {
  isBlinking: boolean
  blinkProgress: number
  nextBlink: number
  blinkDuration: number
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  pulse: number
}

type ParticleSystem = {
  particles: RefObject<Array<Particle>>
  initializeParticles: (x: number, y: number) => void
  updateParticles: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    time: number,
    r: number,
    g: number,
    b: number
  ) => void
}

type UseCanvasAnimationProps = {
  isActive: boolean
  theme?: Theme
  waveformData: MutableRefObject<Array<number>>
  getAverageAmplitude: () => number
  eyeOffset: MutableRefObject<{ x: number; y: number }>
  updateEyeOffset: (canvas: HTMLCanvasElement, time: number) => void
  blinkState: MutableRefObject<BlinkState>
  updateBlinking: (now: number) => void
  particles: ParticleSystem
  drawIrisWaveform: (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    intensity: number
  ) => void
}

export const useCanvasAnimation = ({
  isActive,
  theme,
  waveformData,
  getAverageAmplitude,
  eyeOffset,
  updateEyeOffset,
  blinkState,
  updateBlinking,
  particles,
  drawIrisWaveform,
}: UseCanvasAnimationProps): {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>
} => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !theme) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    particles.initializeParticles(centerX, centerY)

    const animate = (): void => {
      const time = Date.now() * 0.001
      const now = Date.now()

      // Dark background
      ctx.fillStyle = "rgba(1, 4, 15, 0.15)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const [r, g, b] = hexToRgb(theme.color)
      const avgAmplitude = getAverageAmplitude()

      updateEyeOffset(canvas, time)
      updateBlinking(now)

      // Outer ring system
      for (let ring = 0; ring < 4; ring++) {
        const radius = 160 + ring * 40
        const segments = 12 + ring * 6
        const opacity = (0.4 - ring * 0.08) * (0.6 + avgAmplitude * 0.4)

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`
        ctx.lineWidth = 2 - ring * 0.3

        for (let seg = 0; seg < segments; seg++) {
          const angle =
            (seg / segments) * Math.PI * 2 + time * (0.5 - ring * 0.1)
          const segLen = ((Math.PI * 2) / segments) * 0.6
          const pulse = 1 + Math.sin(time * 4 + seg * 0.5) * 0.1 * avgAmplitude

          ctx.beginPath()
          ctx.arc(centerX, centerY, radius * pulse, angle, angle + segLen)
          ctx.stroke()
        }
      }

      // Waveform drawing helper with safety
      const drawWaveform = (
        amplitude: number,
        color: string,
        lineWidth: number,
        shadowBlur: number
      ): void => {
        const data = waveformData.current
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        ctx.shadowColor = color
        ctx.shadowBlur = shadowBlur

        const waveWidth = 280
        const waveHeight = 70 * amplitude
        const startX = centerX - waveWidth / 2

        // Gold standard loop for noUncheckedIndexedAccess
        for (const [i, val] of data.entries()) {
          const x = startX + (i / (data.length - 1)) * waveWidth
          const y = centerY + val * waveHeight

          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            const prevVal = data[i - 1]
            if (prevVal !== undefined) {
              const prevX = startX + ((i - 1) / (data.length - 1)) * waveWidth
              const prevY = centerY + prevVal * waveHeight
              const cpX = (prevX + x) / 2
              ctx.quadraticCurveTo(cpX, prevY, x, y)
            }
          }
        }
        ctx.stroke()
      }

      drawWaveform(1.0, theme.color, 4, 20)
      drawWaveform(0.7, `rgba(${r}, ${g}, ${b}, 0.8)`, 2, 12)
      drawWaveform(0.4, `rgba(${r}, ${g}, ${b}, 0.6)`, 1, 6)
      ctx.shadowBlur = 0

      // Particles
      particles.updateParticles(ctx, centerX, centerY, time, r, g, b)

      // Eye rendering
      const eyeCenterX = centerX + eyeOffset.current.x
      const eyeCenterY = centerY + eyeOffset.current.y

      // Iris & Eye Ellipse logic (simplified for brevity, stays same as your original)
      const eyePulse = 1 + Math.sin(time * 1.5) * 0.02
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.ellipse(
        eyeCenterX,
        eyeCenterY,
        160 * eyePulse,
        100 * eyePulse,
        0,
        0,
        Math.PI * 2
      )
      ctx.stroke()

      drawIrisWaveform(ctx, eyeCenterX, eyeCenterY, avgAmplitude)

      // Blink logic
      const bs = blinkState.current
      if (bs.isBlinking) {
        const blinkEase = 1 - Math.pow(1 - bs.blinkProgress * 2, 3)
        const blinkAmount = Math.sin(blinkEase * Math.PI) * 100
        ctx.fillStyle = "rgba(1, 4, 15, 0.95)"
        // Top lid
        ctx.beginPath()
        ctx.ellipse(
          eyeCenterX,
          eyeCenterY - 50 + blinkAmount,
          160,
          50,
          0,
          0,
          Math.PI
        )
        ctx.fill()
        // Bottom lid
        ctx.beginPath()
        ctx.ellipse(
          eyeCenterX,
          eyeCenterY + 50 - blinkAmount,
          160,
          50,
          0,
          Math.PI,
          Math.PI * 2
        )
        ctx.fill()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [
    isActive,
    theme,
    getAverageAmplitude,
    updateEyeOffset,
    updateBlinking,
    particles,
    drawIrisWaveform,
    waveformData,
  ])

  return { canvasRef }
}
