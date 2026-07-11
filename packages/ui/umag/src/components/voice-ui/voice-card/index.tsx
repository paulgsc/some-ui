import { forwardRef } from "react"

export const VoiceAvatarCanvas = forwardRef<HTMLCanvasElement>((_, ref) => {
  return (
    <canvas
      ref={ref}
      width={600}
      height={600}
      className="rounded-2xl border border-amber-500/20 shadow-2xl shadow-amber-500/10"
    />
  )
})

VoiceAvatarCanvas.displayName = "VoiceAvatarCanvas"
