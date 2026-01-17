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
  const unlockedRef = useRef(false)

  // Initialize audio files IMMEDIATELY, not in useEffect
  if (audioContextRef.current.size === 0) {
    const audioFiles: Record<AudioEvent, string> = {
      match_correct: "/sfx/correct.mp3",
      match_perfect: "/sfx/correct.mp3",
      match_miss: "/sfx/miss.mp3",
      character_expire: "/sfx/expire.mp3",
      streak_milestone: "/sfx/correct.mp3",
      character_spawn: "/sfx/spawn.mp3",
      difficulty_increase: "/sfx/correct.mp3",
      game_complete: "/sfx/correct.mp3",
      game_timeout: "/sfx/timeout.mp3",
      buffer_stale: "/sfx/correct.mp3",
      board_full: "/sfx/correct.mp3",
    }

    Object.entries(audioFiles).forEach(([event, path]) => {
      const audio = new Audio(path)
      audio.preload = "auto"
      audio.volume = volume
      audioContextRef.current.set(event as AudioEvent, audio)
    })
  }

  const unlockAudio = useCallback(() => {
    if (unlockedRef.current) return
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioContextRef.current.forEach((audio) => {
        audio.pause()
        audio.src = ""
      })
      audioContextRef.current.clear()
    }
  }, [])

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
      if (!audio) {
        console.log("no audio found for event: ", event)
        return
      }
      audio.currentTime = 0
      audio.volume = volume
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn(`Playback blocked for ${event}:`, err)
        })
      }
    },
    [enabled, volume]
  )

  return { playSound, unlockAudio }
}
