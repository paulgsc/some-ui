import type { NowPlayingType } from "@umag/types/now-playing"
import { create } from "zustand"

const defaultNowPlaying: NowPlayingType = {
  title: "No video",
  channel: "Unknown",
  video_id: "",
  current_time: 0,
  duration: 0,
  thumbnail: "",
}

type NowPlayingStore = {
  latest: NowPlayingType
  setLatest: (event: NowPlayingType) => void
}

export const useNowPlayingStore = create<NowPlayingStore>((set) => ({
  latest: defaultNowPlaying,
  setLatest: (event): void => set({ latest: event }),
}))

/**
 * Always returns the latest event.
 * Any component mounting later immediately sees the last value.
 */
export function useLatestNowPlaying(): NowPlayingType {
  return useNowPlayingStore((state) => state.latest)
}

/**
 * Update the latest event (e.g. from WebSocket)
 */
export function pushNowPlaying(event: NowPlayingType): void {
  useNowPlayingStore.getState().setLatest(event)
}
