/**
 * Android's own text-to-speech, over `@capacitor-community/text-to-speech`.
 * Only ever imported dynamically, by `./index`, in the device build.
 *
 * Never resolve `TextToSpeech` itself from a promise: a Capacitor plugin
 * proxy answers every property, `then` included, so awaiting it calls a
 * native `then` that does not exist. Call through this module instead.
 *
 * The plugin's language tags are translated to and from `SpokenLanguage`
 * here (`spokenLanguageOf`, `LANGUAGE_TAG`); nothing past this module sees
 * one.
 */
import type { SpeechSynthesisVoice as PluginVoice } from "@capacitor-community/text-to-speech"
import {
  QueueStrategy,
  TextToSpeech,
} from "@capacitor-community/text-to-speech"
import { registerPlugin } from "@capacitor/core"
import type {
  NativeSpeechEngine,
  NativeSpeechRequest,
  NativeVoice,
  SpokenLanguage,
} from "@some-ui/speech"
import { LANGUAGE_TAG, spokenLanguageOf } from "@some-ui/speech"

/**
 * A name a person can tell voices apart by. The plugin's `name` is the
 * voice's language and country, the same for every voice in a language;
 * Android's own name (`ko-kr-x-kob-local`) carries the variant.
 */
function nameOf(voice: PluginVoice): string {
  const variant = /-x-([a-z0-9]+)/i.exec(voice.voiceURI)?.[1]
  return variant ? `Voice ${variant.toUpperCase()}` : voice.voiceURI
}

function toNativeVoice(voice: PluginVoice): NativeVoice {
  return {
    // Android's `Voice.getName()`, which is unique and stable.
    id: voice.voiceURI,
    name: nameOf(voice),
    language: spokenLanguageOf(voice.lang),
    local: voice.localService,
  }
}

/**
 * Android binds its TTS service asynchronously, and until then the plugin
 * answers wrongly instead of waiting (`speak` refuses, `isLanguageSupported`
 * says false, `getSupportedVoices` throws). With no readiness call, a voice
 * list coming back is the signal every call waits for. With no engine at
 * all, calls fail after `READY_TIMEOUT_MS` until a later call finds one.
 */
const READY_TIMEOUT_MS = 10_000
const READY_FIRST_RETRY_MS = 100
const READY_MAX_RETRY_MS = 1_000

let ready: Promise<void> | null = null

function whenReady(): Promise<void> {
  ready ??= waitForEngine().catch((error: unknown) => {
    ready = null
    throw error
  })
  return ready
}

async function waitForEngine(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let retryIn = READY_FIRST_RETRY_MS
  for (;;) {
    try {
      await TextToSpeech.getSupportedVoices()
      return
    } catch (error) {
      if (Date.now() + retryIn > deadline) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, retryIn))
    retryIn = Math.min(retryIn * 2, READY_MAX_RETRY_MS)
  }
}

async function getVoices(): Promise<ReadonlyArray<NativeVoice>> {
  await whenReady()
  const { voices } = await TextToSpeech.getSupportedVoices()
  return voices.map(toNativeVoice)
}

/**
 * The plugin names a voice by its index in `getSupportedVoices`, so the index
 * is looked up before each utterance: installing a voice shifts it.
 */
async function voiceIndexOf(voiceId: string): Promise<number | undefined> {
  const index = (await getVoices()).findIndex((voice) => voice.id === voiceId)
  return index === -1 ? undefined : index
}

/**
 * Bumped by every `speak` and `stop`, so a `stop` (or newer `speak`) landing
 * during `speak`'s voice lookup wins rather than the stopped utterance
 * starting afterwards.
 */
let generation = 0

async function speak(request: NativeSpeechRequest): Promise<void> {
  generation += 1
  const mine = generation
  await whenReady()
  const voice =
    request.voiceId === undefined
      ? undefined
      : await voiceIndexOf(request.voiceId)
  if (mine !== generation) {
    // Replaced before it started. The engine contract lets a replaced
    // utterance never settle, and the adapter has already settled it.
    return new Promise<void>(() => undefined)
  }
  await TextToSpeech.speak({
    text: request.text,
    lang: request.language ? LANGUAGE_TAG[request.language] : undefined,
    voice,
    rate: request.rate,
    pitch: request.pitch,
    volume: request.volume,
    queueStrategy: QueueStrategy.Flush,
  })
}

async function stop(): Promise<void> {
  generation += 1
  await TextToSpeech.stop()
}

async function isLanguageSupported(language: SpokenLanguage): Promise<boolean> {
  await whenReady()
  const { supported } = await TextToSpeech.isLanguageSupported({
    lang: LANGUAGE_TAG[language],
  })
  return supported
}

export const engine: NativeSpeechEngine = {
  speak,
  stop,
  getVoices,
  isLanguageSupported,
}

/**
 * The app's own plugin (`apps/mobile`'s `VoiceDataPlugin.java`): the TTS
 * plugin's `openInstall` launches a voice-data *check* that may offer no
 * download; this launches the engine's installer or the TTS settings.
 */
const VoiceData = registerPlugin<{ openInstall: () => Promise<void> }>(
  "VoiceData"
)

/**
 * Opens the engine's own screen for installing voice data, where Korean is
 * one download away.
 */
export async function openVoiceInstall(): Promise<void> {
  await VoiceData.openInstall()
}
