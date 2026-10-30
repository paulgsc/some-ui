/**
 * The toolbar button's notice (R13): autoplay stopped on a tab where the
 * page could not have shown it would. The content script says so with
 * {@link stoppedMessage}, and the background draws it on that tab's
 * button through {@link createNotices}; the popup reads it back off the badge
 * ({@link stoppedOn}), so nothing is stored.
 *
 * A mark, never a count (`docs/absent-plated-heard.md` §8): the badge says
 * that autoplay stopped, not how often.
 */

import { STOP_WORDS } from "@censor/lib/settings/words"
import { isRecord } from "@some-extension/common/utils/guards"

const KIND = "boyo/stopped"

export type StoppedMessage = {
  readonly kind: typeof KIND
  readonly stopped: boolean
}

export function stoppedMessage(stopped: boolean): StoppedMessage {
  return { kind: KIND, stopped }
}

/** What a message says, or null when it is not this one. */
export function parseStopped(message: unknown): boolean | null {
  if (!isRecord(message) || message["kind"] !== KIND) return null
  const stopped = message["stopped"]
  return typeof stopped === "boolean" ? stopped : null
}

/** A muted grey: the notice reads as a fact, not an alarm. */
const BADGE_COLOR = "#5f6368"

export type ActionPort = Pick<
  typeof browser.action,
  "setBadgeText" | "setBadgeBackgroundColor" | "setTitle" | "getBadgeText"
>

/**
 * Show, or take away, the notice on one tab's button. Taking it away puts
 * the button's own title back.
 */
async function showStopped(
  action: ActionPort,
  tabId: number,
  stopped: boolean
): Promise<void> {
  if (stopped) {
    await action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR })
  }
  await action.setBadgeText({ tabId, text: stopped ? STOP_WORDS.badge : "" })
  await action.setTitle({ tabId, title: stopped ? STOP_WORDS.title : null })
}

/**
 * What draws the notice: each tab's updates run one after another, so the
 * last message a tab sent is the last one drawn, however long a call
 * takes. A failed update is dropped, and the next one still runs.
 */
export function createNotices(
  action: ActionPort
): (tabId: number, stopped: boolean) => Promise<void> {
  const queues = new Map<number, Promise<void>>()
  return (tabId, stopped) => {
    const next = (queues.get(tabId) ?? Promise.resolve())
      .then(() => showStopped(action, tabId, stopped))
      // Ignored: a tab closed before its notice was drawn needs none.
      .catch(() => undefined)
      .finally(() => {
        if (queues.get(tabId) === next) queues.delete(tabId)
      })
    queues.set(tabId, next)
    return next
  }
}

export async function stoppedOn(
  action: ActionPort,
  tabId: number
): Promise<boolean> {
  return (await action.getBadgeText({ tabId })) !== ""
}
