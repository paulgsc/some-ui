export type WhitelistEntry = {
  channelId: string
  channelName: string
  addedAt: number
}

export type VideoState = {
  videoId: string
  revealed: boolean
  timestamp: number
}

export type StorageData = {
  whitelist: Array<WhitelistEntry>
  sessionState: Record<string, VideoState>
  settings: {
    enableWhitelist: boolean
    blurIntensity: number
  }
}

export enum DisclosureLevel {
  MASKED = 0,
  METADATA = 1,
  TITLE = 2,
  REVEALED = 3,
}

export type VideoMetadata = {
  channelName: string
  duration: string
  uploadDate: string
}

export type VideoElement = {
  element: Element
  videoId: string
  channelId: string
  level: DisclosureLevel
}

export type MessageType =
  | "ADD_TO_WHITELIST"
  | "REMOVE_FROM_WHITELIST"
  | "GET_WHITELIST"
  | "CLEAR_SESSION"
  | "UPDATE_SETTINGS"
  | "IS_WHITELISTED"
  | "UPDATE_VIDEO_STATE"
  | "GET_SETTINGS"
  | "GET_SESSION_STATE"

export type Message = {
  type: MessageType
  payload?: any
}
