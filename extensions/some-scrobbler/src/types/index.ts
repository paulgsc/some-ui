export type VideoMetadata = {
  title: string
  channel: string
  video_id: string
  current_time: number
  duration: number
  thumbnail: string
}

export type Message = {
  type: "now-playing" | "toggle-tracking" | "get-status"
  payload?: VideoMetadata
}

export type ExtensionState = {
  isEnabled: boolean
  lastStatus: "success" | "error" | "idle"
  lastError?: string
  lastSong?: string
}

export type BadgeStatus = {
  text: string
  color: string
}
