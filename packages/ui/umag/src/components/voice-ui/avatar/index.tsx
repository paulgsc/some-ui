import { useEffect, useState } from "react"
import { VoiceAvatarControls } from "@umag/components/voice-ui/controls"
import { VoiceAvatarCanvas } from "@umag/components/voice-ui/voice-card"
import { useBlinking } from "@umag/hooks/voice-ui/use-blinking"
import { useCanvasAnimation } from "@umag/hooks/voice-ui/use-canvas-animation"
import { useEyeTracking } from "@umag/hooks/voice-ui/use-eye-tracking"
import { useParticles } from "@umag/hooks/voice-ui/use-particles"
import { useTheme } from "@umag/hooks/voice-ui/use-theme"
import { useWaveform } from "@umag/hooks/voice-ui/use-waveform"

export const VoiceAvatar = () => {
  const [isActive, setIsActive] = useState(false)
  const { theme, cycleTheme } = useTheme()
  const { waveformData, updateWaveform, getAverageAmplitude } = useWaveform()
  const { eyeOffset, handleMouseMove, updateEyeOffset } = useEyeTracking()
  const { blinkState, updateBlinking } = useBlinking()
  const { particles, initializeParticles, updateParticles } = useParticles()

  const drawIrisWaveform = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    intensity: number
  ) => {
    const [r, g, b] = hexToRgb(theme.color)
    ctx.beginPath()
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.9 + intensity * 0.1})`
    ctx.lineWidth = 3
    ctx.shadowColor = theme.color
    ctx.shadowBlur = 15

    const irisWaveWidth = 100
    const irisWaveHeight = 25
    const startX = centerX - irisWaveWidth / 2

    for (let i = 0; i < waveformData.current.length; i++) {
      const x = startX + (i / (waveformData.current.length - 1)) * irisWaveWidth
      const y = centerY + waveformData.current[i] * irisWaveHeight
      if (i === 0) ctx.moveTo(x, y)
      else {
        const prevX =
          startX + ((i - 1) / (waveformData.current.length - 1)) * irisWaveWidth
        const prevY = centerY + waveformData.current[i - 1] * irisWaveHeight
        const cpX = (prevX + x) / 2
        ctx.quadraticCurveTo(cpX, prevY, x, y)
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
    updateEyeOffset: (time) => {
      updateEyeOffset()
      updateWaveform(isActive, time as any)
    },
    blinkState,
    updateBlinking,
    particles: { particles, initializeParticles, updateParticles },
    drawIrisWaveform,
  })

  useEffect(() => {
    const handleMouseMoveWrapper = (e: MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      handleMouseMove(e, canvas)
    }

    window.addEventListener("mousemove", handleMouseMoveWrapper)
    return () => window.removeEventListener("mousemove", handleMouseMoveWrapper)
  }, [handleMouseMove, canvasRef])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8">
      <VoiceAvatarCanvas ref={canvasRef} />

      <VoiceAvatarControls
        isActive={isActive}
        themeName={theme.name}
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
        {theme.temp === "hot" ? "Hot energy" : "Cool vibes"}
      </p>
    </div>
  )
}

// utils in same file for now
const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [234, 179, 8]
}
