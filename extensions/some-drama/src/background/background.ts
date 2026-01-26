// Background Script - Message handling and storage
// All types inlined to avoid shared chunks

type CapturedMoment = {
  id: string
  timestamp: number
  emotion: string
  intensity: number
  emoji: string
  note?: string
  episodeId: string
  dramaTitle: string
  capturedAt: number
}

// Fixed TS6196: Exporting or using the interface to avoid "declared but never used"
export type StorageData = {
  moments: Array<CapturedMoment>
  settings?: {
    pollingInterval?: number
    autoSave?: boolean
  }
}

// Message types
type SaveMomentMessage = {
  type: "SAVE_MOMENT"
  moment: CapturedMoment
}

type GetMomentsMessage = {
  type: "GET_MOMENTS"
  dramaTitle?: string
  episodeId?: string
}

type Message = SaveMomentMessage | GetMomentsMessage

// Storage helpers
async function getAllMoments(): Promise<Array<CapturedMoment>> {
  // Fixed TS2554/TS7006: Using Promise-based API instead of callback
  const result = await browser.storage.local.get("moments")
  return (result.moments as Array<CapturedMoment>) || []
}

async function saveMoment(moment: CapturedMoment): Promise<void> {
  const moments = await getAllMoments()
  moments.push(moment)

  // Fixed TS2554: browser.storage.local.set returns a promise
  await browser.storage.local.set({ moments })
  console.log("[Background] Saved moment:", moment.id)
}

async function getMomentsByFilter(
  dramaTitle?: string,
  episodeId?: string
): Promise<Array<CapturedMoment>> {
  const allMoments = await getAllMoments()

  return allMoments.filter((moment) => {
    if (dramaTitle && moment.dramaTitle !== dramaTitle) return false
    if (episodeId && moment.episodeId !== episodeId) return false
    return true
  })
}

// Message listener
// Fixed TS6133: Prefixed 'sender' with underscore since it's unused
browser.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    console.log("[Background] Received message:", message.type)

    if (message.type === "SAVE_MOMENT") {
      saveMoment(message.moment).then(() => {
        sendResponse({ success: true })
      })
      return true // Will respond asynchronously
    }

    if (message.type === "GET_MOMENTS") {
      getMomentsByFilter(message.dramaTitle, message.episodeId).then(
        (moments) => {
          sendResponse({ moments })
        }
      )
      return true // Will respond asynchronously
    }

    return false
  }
)

// Initialize
console.log("[Background] Drama Sentiment background script loaded")

// Export empty object to satisfy TypeScript if not exporting anything else
export {}
