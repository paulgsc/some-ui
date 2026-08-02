/* eslint-disable react-hooks/refs -- lazy ref initialization, which React
   documents as the way to build a mutable resource exactly once per
   component. A `useState` initializer cannot replace it here: the player has
   to be *recreated* after a Strict Mode cleanup disposes it, and doing that
   from state would mean calling setState inside an effect. */

import { useEffect, useRef, useSyncExternalStore } from "react"
import type {
  AudioPlayer,
  AudioPlayerOptions,
  AudioPlayerState,
} from "@speech/lib/engine"
import { createAudioPlayer } from "@speech/lib/engine"

export type UseAudioPlayerReturn = {
  player: AudioPlayer
  state: AudioPlayerState
}

/**
 * A Web Audio player scoped to the calling component, torn down with it.
 *
 * The player itself is a plain object (`engine/audio-player`) precisely so
 * that its lifetime doesn't have to be a component's - this hook is for the
 * cases where it legitimately is, and its whole job is to guarantee the
 * disposal that the pre-rewrite `useAudioSpeech` never performed.
 */
export function useAudioPlayer(
  options: AudioPlayerOptions = {}
): UseAudioPlayerReturn {
  const playerRef = useRef<AudioPlayer | null>(null)

  // Recreated after disposal, so a Strict Mode remount (mount, cleanup,
  // mount again on the same instance) gets a live player rather than the
  // corpse of the first one.
  if (!playerRef.current || playerRef.current.disposed) {
    playerRef.current = createAudioPlayer(options)
  }
  const player = playerRef.current

  useEffect(() => {
    return (): void => player.dispose()
  }, [player])

  const state = useSyncExternalStore(
    player.subscribe,
    () => player.state,
    () => player.state
  )

  return { player, state }
}
