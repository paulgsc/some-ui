import { useEffect, useState } from "react"

export function useVolumeControl(gainNode: GainNode | null) {
  const [volume, setVolume] = useState(0.5)

  useEffect(() => {
    if (gainNode) {
      gainNode.gain.setValueAtTime(volume, gainNode.context.currentTime)
    }
  }, [volume, gainNode])

  return { volume, setVolume }
}
