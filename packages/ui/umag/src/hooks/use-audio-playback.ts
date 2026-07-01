import { useEffect, useState } from "react"

type UseAudioPlaybackReturn = {
  isPlaying: boolean
  togglePlay: () => void
}

export function useAudioPlayback(
  audioElement: HTMLAudioElement | null,
  audioContext: AudioContext | null
): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = (): void => {
    if (!audioElement) return

    if (audioContext?.state === "suspended") {
      audioContext.resume()
    }

    if (!isPlaying) {
      audioElement.play()
    } else {
      audioElement.pause()
    }
    setIsPlaying(!isPlaying)
  }

  useEffect(() => {
    if (!audioElement) return

    const handleEnded = (): void => setIsPlaying(false)
    audioElement.addEventListener("ended", handleEnded)

    return (): void => {
      audioElement.removeEventListener("ended", handleEnded)
    }
  }, [audioElement])

  return { isPlaying, togglePlay }
}
