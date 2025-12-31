import { create } from "zustand"

export type NowPlayingType = {
  title?: string
  channel?: string
  video_id?: string
  current_time?: number
  duration?: number
  thumbnail?: string
}

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
  setLatest: (event) => set({ latest: event }),
}))

/**
 * Always returns the latest event.
 * Any component mounting later immediately sees the last value.
 */
export function useLatestNowPlaying() {
  return useNowPlayingStore((state) => state.latest)
}

/**
 * Update the latest event (e.g. from WebSocket)
 */
export function pushNowPlaying(event: NowPlayingType) {
  useNowPlayingStore.getState().setLatest(event)
}
