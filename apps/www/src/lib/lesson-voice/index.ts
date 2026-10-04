/**
 * Who reads this site's lessons aloud, in words a person can act on.
 *
 * The speech session can say, for any language, which platform would speak
 * a line and in which voice (`Speaker.describe`). This turns that report,
 * for the language every lesson here is in, into the line the header's
 * audio indicator shows - so a Korean line that sounds un-Korean can be
 * traced to its cause (a browser with no Korean voice reading Hangul in an
 * English one) from the page itself, with the one step that fixes it on the
 * device in hand.
 */
import type { SpokenLanguage, VoiceReport } from "@some-ui/speech"

/** What every lesson on this site is spoken in. */
export const LESSON_LANGUAGE: SpokenLanguage = "korean"

/** The systems whose speech settings this module can point into. */
export type DeviceKind = "android" | "ios" | "mac" | "windows" | "other"

export type LessonVoiceSummary = {
  /** Short, for a tooltip: "In-Joon (Korean Male) · this site's voice". */
  readonly label: string
  /** One sentence: what is speaking. */
  readonly detail: string
  /**
   * When `warning`, the one thing to do about it on this device, ending
   * with the alternative; otherwise null.
   */
  readonly fix: string | null
  /** The platform said it has no Korean voice: lessons are silent or un-Korean. */
  readonly warning: boolean
}

const PLATFORM: Readonly<Record<VoiceReport["platform"], string>> = {
  hosted: "this site's voice service",
  browser: "your browser's own voice",
  phone: "this phone's text-to-speech",
}

/**
 * Where a Korean voice is added, per system. Paths differ between phone
 * makers on Android, so that one searches for the setting rather than
 * walking a menu that may not exist.
 */
const ADD_KOREAN_VOICE: Readonly<Record<DeviceKind, string>> = {
  android:
    "On Android: open Settings, search “Text-to-speech”, tap the engine’s ⚙ → Install voice data → Korean.",
  ios: "On iPhone or iPad: Settings → Accessibility → Spoken Content → Voices → Korean, and download a voice.",
  mac: "On a Mac: System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → Korean.",
  windows:
    "On Windows: Settings → Time & language → Speech → Manage voices → Add voices → Korean.",
  other: "Add a Korean voice in your system’s speech settings.",
}

const BROWSER_FIX_TAIL =
  " Then reload this page. Or sign in, and lessons use this site’s voice."

/** The system a browser runs on, from its user agent, as far as it says. */
export function deviceKindOf(userAgent: string): DeviceKind {
  if (/android/i.test(userAgent)) return "android"
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios"
  // iPadOS reports itself as a Mac; a touch screen tells them apart, which
  // a user agent cannot, so an iPad here gets the Mac steps. Close enough:
  // both live under Accessibility → Spoken Content.
  if (/macintosh|mac os x/i.test(userAgent)) return "mac"
  if (/windows/i.test(userAgent)) return "windows"
  return "other"
}

export function summarizeLessonVoice(
  report: VoiceReport,
  device: DeviceKind = "other"
): LessonVoiceSummary {
  const platform = PLATFORM[report.platform]

  switch (report.availability) {
    case "available": {
      // A platform can speak Korean without a voice it will name: the
      // phone's own default, say.
      const voice = report.voice ?? "its default Korean voice"
      return {
        label: `${report.voice ?? "Default voice"} · ${platform}`,
        detail: `Korean lessons are read by ${voice}, ${platform}.`,
        fix: null,
        warning: false,
      }
    }
    // Not a warning: nothing has said Korean is missing. A browser still
    // loading its voices used to read as "no Korean voice" until they came.
    case "checking": {
      return {
        label: `Checking for a Korean voice · ${platform}`,
        detail: `Still finding out whether ${platform} has a Korean voice.`,
        fix: null,
        warning: false,
      }
    }
    case "unverifiable": {
      return {
        label: `Korean voice unknown · ${platform}`,
        detail: `${platform} could not say whether it has a Korean voice; lessons will try it anyway.`,
        fix: null,
        warning: false,
      }
    }
    case "missing": {
      return missingVoice(report, platform, device)
    }
    default: {
      return assertNever(report.availability)
    }
  }
}

function missingVoice(
  report: VoiceReport,
  platform: string,
  device: DeviceKind
): LessonVoiceSummary {
  const label = `No Korean voice · ${platform}`
  switch (report.platform) {
    case "hosted": {
      return {
        label,
        detail:
          "This voice service has no Korean voice, so lessons are not read aloud.",
        fix: "Pick a provider with a Korean voice in Settings.",
        warning: true,
      }
    }
    case "browser": {
      return {
        label,
        detail: report.voice
          ? `Your browser has no Korean voice, so it reads Korean with ${report.voice}, a voice for another language.`
          : "Your browser offers no voice for Korean.",
        fix: ADD_KOREAN_VOICE[device] + BROWSER_FIX_TAIL,
        warning: true,
      }
    }
    case "phone": {
      return {
        label,
        detail:
          "This phone has no Korean voice installed, so lessons are not read aloud.",
        fix: "Install one from Settings → Voice.",
        warning: true,
      }
    }
    default: {
      return assertNever(report.platform)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled voice report: ${JSON.stringify(value)}`)
}
