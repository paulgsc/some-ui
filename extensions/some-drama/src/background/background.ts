


type EmotionType = "joy" | "sadness" | "love" | "rage" | "fear" | "neutral"

interface CapturedMoment {
  id: string
  timestamp: number     // seconds into video
  emotion: EmotionType
  intensity: number     // 0–1
  emoji: string
  note?: string
  episodeId: string
  dramaTitle: string
  capturedAt: number    // unix ms
}

type BackgroundMessage =
  | { type: "SAVE_MOMENT"; payload: CapturedMoment }
  | { type: "GET_MOMENTS"; payload?: { dramaTitle?: string } }
  | { type: "CLEAR_MOMENTS" }

type BackgroundResponse =
  | { ok: true; moments?: CapturedMoment[] }
  | { ok: false; error: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "drama_moments"

async function loadMoments(): Promise<CapturedMoment[]> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as CapturedMoment[] | undefined) ?? []
}

async function saveMoment(moment: CapturedMoment): Promise<void> {
  const existing = await loadMoments()
  existing.push(moment)
  await browser.storage.local.set({ [STORAGE_KEY]: existing })
  console.log("[Background] Saved moment:", moment.id, moment.emotion, "@", moment.timestamp)
}

// ─── Message handler ─────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(
  (
    msg: unknown,
    _sender: browser.runtime.MessageSender,
    sendResponse: (resp: BackgroundResponse) => void
  ) => {
    const message = msg as BackgroundMessage

    switch (message.type) {
      case "SAVE_MOMENT":
        saveMoment(message.payload)
          .then(() => sendResponse({ ok: true }))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: String(err) })
          )
        return true // keep channel open for async

      case "GET_MOMENTS":
        loadMoments()
          .then((moments) => {
            const filter = message.payload?.dramaTitle
            const filtered = filter
              ? moments.filter((m) => m.dramaTitle === filter)
              : moments
            sendResponse({ ok: true, moments: filtered })
          })
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: String(err) })
          )
        return true

      case "CLEAR_MOMENTS":
        browser.storage.local
          .remove(STORAGE_KEY)
          .then(() => sendResponse({ ok: true }))
          .catch((err: unknown) =>
            sendResponse({ ok: false, error: String(err) })
          )
        return true

      default:
        return false
    }
  }
)

console.log("[Background] Drama Sentiment background worker ready.")
export {}
