import { useEffect, useState } from "react"

export function useAudioPlayback(
  audioElement: HTMLAudioElement | null,
  audioContext: AudioContext | null
) {
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = () => {
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

    const handleEnded = () => setIsPlaying(false)
    audioElement.addEventListener("ended", handleEnded)

    return () => {
      audioElement.removeEventListener("ended", handleEnded)
    }
  }, [audioElement])

  return { isPlaying, togglePlay }
}
