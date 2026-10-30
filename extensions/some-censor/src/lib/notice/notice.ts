/**
 * The toolbar button's notice (R13): autoplay stopped on a tab where the
 * page could not have shown it would. The content script says so with
 * {@link stoppedMessage}, and the background draws it on that tab's
 * button with {@link showStopped}; the popup reads it back off the badge
 * ({@link stoppedOn}), so nothing is stored.
 *
 * A mark, never a count (`docs/absent-plated-heard.md` §8): the badge says
 * that autoplay stopped, not how often.
 */

import { STOP_WORDS } from "@censor/lib/settings/words"

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
  if (typeof message !== "object" || message === null) return null
  if (Reflect.get(message, "kind") !== KIND) return null
  const stopped: unknown = Reflect.get(message, "stopped")
  return typeof stopped === "boolean" ? stopped : null
}

/** A muted grey: the notice reads as a fact, not an alarm. */
const BADGE_COLOR = "#5f6368"

/** The part of `browser.action` the notice uses. */
export type ActionPort = Pick<
  typeof browser.action,
  "setBadgeText" | "setBadgeBackgroundColor" | "setTitle" | "getBadgeText"
>

/**
 * Show, or take away, the notice on one tab's button. Taking it away puts
 * the button's own title back.
 */
export async function showStopped(
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

/** Whether the notice is on `tabId`'s button now. */
export async function stoppedOn(
  action: ActionPort,
  tabId: number
): Promise<boolean> {
  return (await action.getBadgeText({ tabId })) !== ""
}
