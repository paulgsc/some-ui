import { useCallback, useEffect, useRef } from "react"

export type AudioEvent =
  | "match_correct"
  | "match_perfect"
  | "match_miss"
  | "character_expire"
  | "streak_milestone"
  | "character_spawn"
  | "difficulty_increase"
  | "game_complete"
  | "game_timeout"
  | "buffer_stale"
  | "board_full"

type UseGameAudioProps = {
  enabled?: boolean
  volume?: number
}

export const useGameAudio = ({
  enabled = true,
  volume = 0.5,
}: UseGameAudioProps = {}) => {
  const audioContextRef = useRef<Map<AudioEvent, HTMLAudioElement>>(new Map())
  const isInitializedRef = useRef(false)
  const unlockedRef = useRef(false)

  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return

    console.log("[audio] unlocking")

    audioContextRef.current.forEach((audio) => {
      audio.muted = true
      audio
        .play()
        .then(() => {
          audio.pause()
          audio.currentTime = 0
          audio.muted = false
        })
        .catch(() => {})
    })

    unlockedRef.current = true
  }, [])

  // Initialize audio files
  useEffect(() => {
    if (isInitializedRef.current) return

    const audioFiles: Record<AudioEvent, string> = {
      match_correct: "/sfx/minimal-pop.mp3",
      match_perfect: "/sfx/subtle-spark.mp3",
      match_miss: "/sfx/error.mp3",
      character_expire: "/sfx/minimal-pop.mp3",
      streak_milestone: "/sfx/level-up.mp3",
      character_spawn: "/sfx/minimal-pop.mp3",
      difficulty_increase: "/sfx/minimal-pop.mp3",
      game_complete: "/sfx/minimal-pop.mp3",
      game_timeout: "/sfx/minimal-pop.mp3",
      buffer_stale: "/sfx/error.mp3",
      board_full: "/sfx/error.mp3",
    }

    const audioMap = new Map<AudioEvent, HTMLAudioElement>()

    Object.entries(audioFiles).forEach(([event, path]) => {
      const audio = new Audio(path)
      audio.volume = volume
      audio.preload = "auto"
      audioMap.set(event as AudioEvent, audio)
    })

    audioContextRef.current = audioMap
    isInitializedRef.current = true

    return () => {
      audioMap.forEach((audio) => {
        audio.pause()
        audio.src = ""
      })
      audioMap.clear()
    }
  }, [volume])

  // Update volume when prop changes
  useEffect(() => {
    audioContextRef.current.forEach((audio) => {
      audio.volume = volume
    })
  }, [volume])

  const playSound = useCallback(
    (event: AudioEvent) => {
      if (!enabled) return

      const audio = audioContextRef.current.get(event)
      console.log("called play sound!")
      if (!audio) return

      // Clone and play to allow overlapping sounds
      const clone = audio.cloneNode() as HTMLAudioElement
      clone.volume = volume
      clone.play().catch((err) => {
        console.warn(`Failed to play audio: ${event}`, err)
      })
    },
    [enabled, volume]
  )

  return { playSound, unlockAudio }
}
