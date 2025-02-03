import { useEffect, useRef, useState } from "react"

export function useAudioElement() {
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null
  )
  const [fileName, setFileName] = useState<string>("")
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null)

  const handleFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    audioContext: AudioContext | null,
    gainNode: GainNode | null
  ) => {
    const file = event.target.files?.[0]
    if (!file || !audioContext || !gainNode) return

    setFileName(file.name)

    const newAudioElement = new Audio(URL.createObjectURL(file))
    newAudioElement.addEventListener(
      "canplaythrough",
      () => {
        if (audioContext && !mediaSourceRef.current) {
          mediaSourceRef.current =
            audioContext.createMediaElementSource(newAudioElement)
          mediaSourceRef.current.connect(gainNode)
        }
      },
      { once: true }
    )

    setAudioElement(newAudioElement)
  }

  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ""
      }
    }
  }, [audioElement])

  return { audioElement, fileName, handleFileUpload }
}
