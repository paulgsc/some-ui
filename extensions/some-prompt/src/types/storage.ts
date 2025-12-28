export type ExtensionSettings = {
  enabled: boolean
  maxUtteranceLength: number
  minUtteranceLength: number
  serverUrl: string
  postThrottleMs: number
}

export type UtterancePayload = {
  text: string
  metadata: UtteranceMetadata
}

export type UtteranceMetadata = {
  url: string
  domain: string
  title: string
  timestamp: string
  element: ElementInfo | null
}

export type ElementInfo = {
  tagName: string
  type: string | null
  id: string | null
  name: string | null
  className: string | null
  placeholder: string | null
  contentEditable?: boolean
  formAction?: string | null
  formMethod?: string | null
  formId?: string | null
}

export type BackgroundMessage = {
  type: "POST_UTTERANCE" | "GET_SETTINGS" | "UPDATE_SETTINGS"
  payload?: any
}

export type BackgroundResponse = {
  success: boolean
  data?: any
  error?: string
}
