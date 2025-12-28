export type EventType =
  | "StartChapter"
  | "EndChapter"
  | "UpdatePayload"
  | "UpdateContext"
  | "RemoveChapter"
  | "ExtendChapter"
  | "CompleteChapter"
  | "ClearAll"

export type Context = {
  title: string
  tags: Record<string, string>
  revision_tag?: string
}

export type Payload = {
  data: any
  metadata?: Record<string, string>
}

export type TimelineEvent = {
  type: EventType
  uid?: string
  context?: Context
  start_time?: number
  end_time?: number
  completion_time?: number
  extend_to?: number
  payload?: Payload
  final_payload?: Payload
}

export type ExistingChapter = {
  uid: string
  title: string
  start_time: number
  end_time?: number
  is_active: boolean
  tags: Record<string, string>
}

export const EVENT_DESCRIPTIONS: Record<EventType, string> = {
  StartChapter: "Create a new chapter segment in the timeline",
  EndChapter: "Close an existing active chapter",
  UpdatePayload: "Update the payload data of an existing chapter",
  UpdateContext: "Update the title and metadata of an existing chapter",
  RemoveChapter: "Completely remove a chapter from the timeline",
  ExtendChapter: "Extend the duration of an active chapter",
  CompleteChapter: "Mark a chapter as completed with final data",
  ClearAll: "Clear all chapters from the timeline",
}
