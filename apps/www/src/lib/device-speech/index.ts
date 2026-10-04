/**
 * The Android app's voice: the phone's own text-to-speech engine (#1625).
 *
 * The APK runs in Android System WebView, which has no working
 * `speechSynthesis`, so the browser voice the static build uses is silent
 * there. `TTSProvider` hands the speech session `deviceSpeechBackend()` as
 * its `native` voice instead, and everything that speaks through the
 * session gets it: TOPIK's lessons and Honeycomb's word prompts alike.
 *
 * The plugin sits behind a dynamic import, so the web builds, which never
 * pass it to the session, never load it. On the phone it loads with the
 * session, which asks for the phone's voices and whether it has Korean
 * before the first line.
 */
import type {
  NativeSpeechBackend,
  NativeSpeechEngine,
  NativeVoice,
  SpokenLanguage,
} from "@some-ui/speech"
import { LANGUAGE_NAME } from "@some-ui/speech"
import { toast } from "sonner"

import { LESSON_LANGUAGE } from "@/lib/lesson-voice"

import type * as NativeModule from "./native"

let loading: Promise<typeof NativeModule> | null = null
function native(): Promise<typeof NativeModule> {
  loading ??= import("./native")
  return loading
}

const lazyEngine: NativeSpeechEngine = {
  speak: (request) => native().then(({ engine }) => engine.speak(request)),
  stop: () => native().then(({ engine }) => engine.stop()),
  getVoices: () => native().then(({ engine }) => engine.getVoices()),
  isLanguageSupported: (language) =>
    native().then(({ engine }) => engine.isLanguageSupported(language)),
}

/** Languages already announced as missing, so a lesson says so once. */
const announced = new Set<SpokenLanguage>()

/**
 * Said once per language per launch, not per refused utterance: a lesson
 * refuses every line it tries, and the first toast already said it all.
 * Settings carries the same fact for as long as it holds.
 */
function announceMissingVoice(language: SpokenLanguage): void {
  if (announced.has(language)) return
  announced.add(language)
  const name = LANGUAGE_NAME[language]
  toast.warning(`No ${name} voice on this phone`, {
    description: `Install ${name} in the phone's text-to-speech settings to hear lessons read aloud.`,
    action: { label: "Install", onClick: openVoiceInstall },
  })
}

/**
 * The phone's engine as the speech session's `native` voice, speaking in
 * the voice picked from the phone's list (an id from `readDeviceVoices`,
 * empty for the phone's default).
 */
export function deviceSpeechBackend(
  voiceId: string | undefined
): NativeSpeechBackend {
  return {
    engine: lazyEngine,
    voiceId: voiceId || undefined,
    onMissingVoice: announceMissingVoice,
  }
}

/** Opens the engine's voice-data screen. Fire and forget. */
export function openVoiceInstall(): void {
  void native()
    .then((module) => module.openVoiceInstall())
    .catch(() => undefined)
}

/** What Settings' "Play sample" says, in the voice being chosen. */
export const PREVIEW_TEXT = "안녕하세요. 오늘도 같이 공부해요."

export type DeviceVoices = {
  /** Voice data for `LESSON_LANGUAGE` is installed and usable. */
  readonly installed: boolean
  /** The phone's voices in that language, offline ones first. */
  readonly voices: ReadonlyArray<NativeVoice>
}

/** The phone's voices in `LESSON_LANGUAGE`, for Settings. */
export async function readDeviceVoices(): Promise<DeviceVoices> {
  const [installed, all] = await Promise.all([
    lazyEngine.isLanguageSupported(LESSON_LANGUAGE),
    lazyEngine.getVoices(),
  ])
  const voices = all
    .filter((voice) => voice.language === LESSON_LANGUAGE)
    .sort((a, b) => Number(b.local) - Number(a.local))
  return { installed, voices }
}

/** A voice as Settings lists it: its name, and whether it works offline. */
export function voiceLabel(voice: NativeVoice): string {
  return `${voice.name} (${voice.local ? "offline" : "needs internet"})`
}
