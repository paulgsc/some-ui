import { useEffect, useRef } from "react"
import { hexToRgb } from "@umag/utils/color-utils"

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
  initializeParticles,
  updateParticles,
  drawIrisWaveform,
}: {
  isActive: boolean
  theme: { color: string }
  waveformData: React.MutableRefObject<Array<number>>
  getAverageAmplitude: () => number
  eyeOffset: React.MutableRefObject<{ x: number; y: number }>
  updateEyeOffset: (canvas: HTMLCanvasElement, time: number) => void
  blinkState: React.MutableRefObject<{
    isBlinking: boolean
    blinkProgress: number
    nextBlink: number
    blinkDuration: number
  }>
  updateBlinking: (now: number) => void
  particles: { particles: any; initializeParticles: any; updateParticles: any }
  drawIrisWaveform: (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    intensity: number
  ) => void
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2

    // Initialize particles
    particles.initializeParticles(centerX, centerY)

    const animate = () => {
      const time = Date.now() * 0.001
      const now = Date.now()

      // Dark background
      ctx.fillStyle = "rgba(1, 4, 15, 0.15)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const [r, g, b] = hexToRgb(theme.color)
      const avgAmplitude = getAverageAmplitude()

      // Update waveform
      waveformData.current.forEach(() => {}) // ensure access
      // (update happens in main effect)

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

      // Floating accent dots
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + time * 0.8
        const radius = 190 + Math.sin(time * 2 + i) * 15 + avgAmplitude * 20
        const x = centerX + Math.cos(angle) * radius
        const y = centerY + Math.sin(angle) * radius
        const size = 6 + Math.sin(time * 3 + i) * 2

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.7 + Math.sin(time * 4 + i) * 0.3})`
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Waveform drawing helper
      const drawWaveform = (
        amplitude: number,
        color: string,
        lineWidth: number,
        shadowBlur: number
      ) => {
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        ctx.shadowColor = color
        ctx.shadowBlur = shadowBlur

        const waveWidth = 280
        const waveHeight = 70 * amplitude
        const startX = centerX - waveWidth / 2

        for (let i = 0; i < waveformData.current.length; i++) {
          const x = startX + (i / (waveformData.current.length - 1)) * waveWidth
          const y = centerY + waveformData.current[i] * waveHeight

          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            const prevX =
              startX + ((i - 1) / (waveformData.current.length - 1)) * waveWidth
            const prevY =
              centerY + waveformData.current[i - 1] * waveHeight * amplitude
            const cpX = (prevX + x) / 2
            const cpY = (prevY + y) / 2
            ctx.quadraticCurveTo(cpX, prevY, x, y)
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

      const outerGlow = ctx.createRadialGradient(
        eyeCenterX,
        eyeCenterY,
        0,
        eyeCenterX,
        eyeCenterY,
        200
      )
      outerGlow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.08)`)
      outerGlow.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.04)`)
      outerGlow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      ctx.fillStyle = outerGlow
      ctx.beginPath()
      ctx.arc(eyeCenterX, eyeCenterY, 200, 0, Math.PI * 2)
      ctx.fill()

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

      const irisGradient = ctx.createRadialGradient(
        eyeCenterX,
        eyeCenterY,
        0,
        eyeCenterX,
        eyeCenterY,
        80
      )
      irisGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.15)`)
      irisGradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.08)`)
      irisGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.25)`)

      ctx.fillStyle = irisGradient
      ctx.beginPath()
      ctx.arc(eyeCenterX, eyeCenterY, 80, 0, Math.PI * 2)
      ctx.fill()

      drawIrisWaveform(ctx, eyeCenterX, eyeCenterY, avgAmplitude)

      // Blink
      if (blinkState.current.isBlinking) {
        const blinkEase =
          1 - Math.pow(1 - blinkState.current.blinkProgress * 2, 3)
        const blinkAmount = Math.sin(blinkEase * Math.PI) * 100

        ctx.fillStyle = "rgba(1, 4, 15, 0.95)"
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

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isActive, theme.color])

  return { canvasRef }
}
