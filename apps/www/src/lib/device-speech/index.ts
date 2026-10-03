/**
 * The Android app's voice: the phone's own text-to-speech engine (#1625).
 *
 * The APK runs in Android System WebView, which has no working
 * `speechSynthesis`, so the browser voice the static build uses is silent
 * there. `TTSProvider` hands the speech session `deviceSpeechBackend()` as
 * its `native` voice instead, and everything that speaks through the
 * session gets it: TOPIK's lessons and Honeycomb's word prompts alike.
 *
 * The plugin sits behind a dynamic import, so the engine costs nothing
 * until something speaks, and the web builds, which never pass it to the
 * session, never load it.
 */
import type {
  NativeSpeechBackend,
  NativeSpeechEngine,
  NativeVoice,
} from "@some-ui/speech"
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
  isLanguageSupported: (lang) =>
    native().then(({ engine }) => engine.isLanguageSupported(lang)),
}

function languageName(lang: string): string {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(
        lang.split("-")[0] ?? lang
      ) ?? lang
    )
  } catch {
    return lang
  }
}

/** Languages already announced as missing, so a lesson says so once. */
const announced = new Set<string>()

/**
 * Said once per language per launch, not per refused utterance: a lesson
 * refuses every line it tries, and the first toast already said it all.
 * Settings carries the same fact for as long as it holds.
 */
function announceMissingVoice(lang: string): void {
  if (announced.has(lang)) return
  announced.add(lang)
  const language = languageName(lang)
  toast.warning(`No ${language} voice on this phone`, {
    description: `Install ${language} in the phone's text-to-speech settings to hear lessons read aloud.`,
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

const PREVIEW_TEXT = "안녕하세요. 오늘도 같이 공부해요."

/**
 * Says a sample line in `voiceId` (or the phone's default voice), so a
 * person can hear a voice before choosing it. Fire and forget: whatever was
 * speaking stops, as it would for any new line.
 */
export function previewDeviceVoice(voiceId: string | undefined): void {
  void lazyEngine
    .speak({
      text: PREVIEW_TEXT,
      lang: LESSON_LANGUAGE,
      voiceId,
      rate: 1,
      pitch: 1,
      volume: 1,
    })
    .catch(() => undefined)
}

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
  const primary = LESSON_LANGUAGE.split("-")[0] ?? LESSON_LANGUAGE
  const voices = all
    .filter((voice) => voice.lang.toLowerCase().startsWith(primary))
    .sort((a, b) => Number(b.local) - Number(a.local))
  return { installed, voices }
}

/** A voice as Settings lists it: its name, and whether it works offline. */
export function voiceLabel(voice: NativeVoice): string {
  return `${voice.name} (${voice.local ? "offline" : "needs internet"})`
}
