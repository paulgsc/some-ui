/**
 * Who reads this site's lessons aloud, in words a person can act on.
 *
 * The speech session can say, for any language, which platform would speak
 * a line and in which voice (`Speaker.describe`). This turns that report,
 * for the language every lesson here is in, into the line the header's
 * audio indicator shows - so a Korean line that sounds un-Korean can be
 * traced to its cause (a browser with no Korean voice reading Hangul in an
 * English one) from the page itself.
 */
import type { VoiceReport } from "@some-ui/speech"

/** What every lesson on this site is spoken in. */
export const LESSON_LANGUAGE = "ko-KR"

export type LessonVoiceSummary = {
  /** Short, for a tooltip: "In-Joon (Korean Male) · this site's voice". */
  readonly label: string
  /** One or two sentences: what is speaking, and what to do if it is wrong. */
  readonly detail: string
  /** The platform has no Korean voice: lessons are silent or un-Korean. */
  readonly warning: boolean
}

const PLATFORM: Readonly<Record<VoiceReport["platform"], string>> = {
  hosted: "this site's voice service",
  browser: "your browser's own voice",
  phone: "this phone's text-to-speech",
}

export function summarizeLessonVoice(report: VoiceReport): LessonVoiceSummary {
  const platform = PLATFORM[report.platform]

  if (report.speaksLanguage) {
    // A platform can speak Korean without a voice it will name: the
    // phone's own default, say.
    const voice = report.voice ?? "its default Korean voice"
    return {
      label: `${report.voice ?? "Default voice"} · ${platform}`,
      detail: `Korean lessons are read by ${voice}, ${platform}.`,
      warning: false,
    }
  }

  switch (report.platform) {
    case "hosted": {
      return {
        label: `No Korean voice · ${platform}`,
        detail:
          "This voice service has no Korean voice, so lessons are not read aloud. Pick a provider with one in Settings.",
        warning: true,
      }
    }
    case "browser": {
      return {
        label: `No Korean voice · ${platform}`,
        detail: report.voice
          ? `Your browser has no Korean voice, so it reads Korean with ${report.voice}, a voice for another language. Add a Korean voice in your system's speech settings, or sign in to use this site's voice service.`
          : "Your browser offers no voice for Korean. Add one in your system's speech settings, or sign in to use this site's voice service.",
        warning: true,
      }
    }
    case "phone": {
      return {
        label: `No Korean voice · ${platform}`,
        detail:
          "This phone has no Korean voice installed, so lessons are not read aloud. Install one in Settings → Voice.",
        warning: true,
      }
    }
    default: {
      return assertNever(report.platform)
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled speech platform: ${JSON.stringify(value)}`)
}
