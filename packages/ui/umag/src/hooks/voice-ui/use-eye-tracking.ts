import { useRef } from "react"

type EyeOffset = { x: number; y: number }

type UseEyeTrackingReturn = {
  eyeOffset: React.RefObject<EyeOffset>
  targetEyeOffset: React.RefObject<EyeOffset>
  handleMouseMove: (e: MouseEvent, canvas: HTMLCanvasElement) => void
  updateEyeOffset: () => void
}

export const useEyeTracking = (): UseEyeTrackingReturn => {
  const eyeOffset = useRef({ x: 0, y: 0 })
  const targetEyeOffset = useRef({ x: 0, y: 0 })

  const updateEyeOffset = (): void => {
    eyeOffset.current.x +=
      (targetEyeOffset.current.x - eyeOffset.current.x) * 0.08
    eyeOffset.current.y +=
      (targetEyeOffset.current.y - eyeOffset.current.y) * 0.08
  }

  const handleMouseMove = (e: MouseEvent, canvas: HTMLCanvasElement): void => {
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const maxOffset = 12

    targetEyeOffset.current = {
      x: Math.max(-maxOffset, Math.min(maxOffset, (mouseX - centerX) * 0.04)),
      y: Math.max(-maxOffset, Math.min(maxOffset, (mouseY - centerY) * 0.04)),
    }
  }

  return { eyeOffset, targetEyeOffset, handleMouseMove, updateEyeOffset }
}
