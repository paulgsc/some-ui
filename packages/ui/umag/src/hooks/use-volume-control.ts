import { useEffect, useState } from "react"

type UseVolumeControlReturn = {
  volume: number
  setVolume: React.Dispatch<React.SetStateAction<number>>
}

export function useVolumeControl(
  gainNode: GainNode | null
): UseVolumeControlReturn {
  const [volume, setVolume] = useState(0.5)

  useEffect(() => {
    if (gainNode) {
      gainNode.gain.setValueAtTime(volume, gainNode.context.currentTime)
    }
  }, [volume, gainNode])

  return { volume, setVolume }
}
