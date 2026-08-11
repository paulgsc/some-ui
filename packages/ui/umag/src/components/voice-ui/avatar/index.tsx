import type { JSX } from "react"
import { useEffect, useState } from "react"
import { VoiceAvatarControls } from "@umag/components/voice-ui/controls"
import { VoiceAvatarCanvas } from "@umag/components/voice-ui/voice-card"
import { useBlinking } from "@umag/hooks/voice-ui/use-blinking"
import { useCanvasAnimation } from "@umag/hooks/voice-ui/use-canvas-animation"
import { useEyeTracking } from "@umag/hooks/voice-ui/use-eye-tracking"
import { useParticles } from "@umag/hooks/voice-ui/use-particles"
import { useTheme } from "@umag/hooks/voice-ui/use-theme"
import { useWaveform } from "@umag/hooks/voice-ui/use-waveform"

export const VoiceAvatar = (): JSX.Element => {
  const [isActive, setIsActive] = useState(false)
  const { theme, cycleTheme } = useTheme()
  const { waveformData, updateWaveform, getAverageAmplitude } = useWaveform()
  const { eyeOffset, handleMouseMove, updateEyeOffset } = useEyeTracking()
  const { blinkState, updateBlinking } = useBlinking()
  const particleSystem = useParticles()

  const drawIrisWaveform = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    intensity: number
  ): void => {
    if (!theme) return
    const [r, g, b] = hexToRgb(theme.color)

    ctx.beginPath()
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.9 + intensity * 0.1})`
    ctx.lineWidth = 3
    ctx.shadowColor = theme.color
    ctx.shadowBlur = 15

    const irisWaveWidth = 100
    const irisWaveHeight = 25
    const startX = centerX - irisWaveWidth / 2
    const data = waveformData.current

    // Using entries() and local bindings to satisfy noUncheckedIndexedAccess
    for (const [i, value] of data.entries()) {
      const x = startX + (i / (data.length - 1)) * irisWaveWidth
      const y = centerY + value * irisWaveHeight

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        const prevValue = data[i - 1]
        // Explicitly handle possible undefined for the previous index
        if (prevValue !== undefined) {
          const prevX = startX + ((i - 1) / (data.length - 1)) * irisWaveWidth
          const prevY = centerY + prevValue * irisWaveHeight
          const cpX = (prevX + x) / 2
          ctx.quadraticCurveTo(cpX, prevY, x, y)
        }
      }
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  const { canvasRef } = useCanvasAnimation({
    isActive,
    theme,
    waveformData,
    getAverageAmplitude,
    eyeOffset,
    updateEyeOffset: (_: HTMLCanvasElement, time: number): void => {
      updateEyeOffset()
      updateWaveform(isActive, time)
    },
    blinkState,
    updateBlinking,
    particles: particleSystem,
    drawIrisWaveform,
  })

  useEffect(() => {
    const handleMouseMoveWrapper = (e: MouseEvent): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      handleMouseMove(e, canvas)
    }

    window.addEventListener("mousemove", handleMouseMoveWrapper)
    return (): void =>
      window.removeEventListener("mousemove", handleMouseMoveWrapper)
  }, [handleMouseMove, canvasRef])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <VoiceAvatarCanvas ref={canvasRef} />

      <VoiceAvatarControls
        isActive={isActive}
        themeName={theme?.name ?? ""}
        onToggle={() => setIsActive(!isActive)}
        onTest={() => {
          if (!isActive) {
            setIsActive(true)
            setTimeout(() => setIsActive(false), 2500)
          }
        }}
        onChangeTheme={cycleTheme}
      />

      <p className="mt-6 text-sm tracking-wide text-white transition-colors duration-500">
        Move your cursor to interact • Themes change during blinks •{" "}
        {theme?.temp === "hot" ? "Hot energy" : "Cool vibes"}
      </p>
    </div>
  )
}

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [234, 179, 8]

  // result[1..3] can be undefined in theory according to TS regex types,
  // though regex guarantees matches here. Fallback to 0.
  return [
    parseInt(result[1] ?? "0", 16),
    parseInt(result[2] ?? "0", 16),
    parseInt(result[3] ?? "0", 16),
  ]
}
