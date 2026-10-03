/**
 * Android's own text-to-speech, over `@capacitor-community/text-to-speech`.
 *
 * Only ever imported dynamically, by `./index`, and only loaded in the
 * device build: the plugin is native, and the web builds have no business
 * loading it.
 *
 * Never return or resolve `TextToSpeech` itself from a promise. A Capacitor
 * plugin is a proxy that answers every property with a native method, `then`
 * included, so awaiting it calls a plugin method named `then` that does not
 * exist. Hand out this module instead and call through it.
 */
import type { SpeechSynthesisVoice as PluginVoice } from "@capacitor-community/text-to-speech"
import {
  QueueStrategy,
  TextToSpeech,
} from "@capacitor-community/text-to-speech"
import type {
  NativeSpeechEngine,
  NativeSpeechRequest,
  NativeVoice,
} from "@some-ui/speech"

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
    lang: voice.lang,
    local: voice.localService,
  }
}

async function getVoices(): Promise<ReadonlyArray<NativeVoice>> {
  const { voices } = await TextToSpeech.getSupportedVoices()
  return voices.map(toNativeVoice)
}

/**
 * The plugin names a voice by its index in the list `getSupportedVoices`
 * returned, so the index is looked up just before each utterance: one
 * cached from earlier points at another voice once a voice is installed.
 */
async function voiceIndexOf(voiceId: string): Promise<number | undefined> {
  const index = (await getVoices()).findIndex((voice) => voice.id === voiceId)
  return index === -1 ? undefined : index
}

/**
 * Bumped by every `speak` and `stop`. `speak` looks the voice up over the
 * bridge before it reaches the plugin, and a `stop` (or a newer `speak`)
 * that lands during that round trip must win: without this, the stopped
 * utterance would start talking after the stop.
 */
let generation = 0

async function speak(request: NativeSpeechRequest): Promise<void> {
  generation += 1
  const mine = generation
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
    lang: request.lang,
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

async function isLanguageSupported(lang: string): Promise<boolean> {
  const { supported } = await TextToSpeech.isLanguageSupported({ lang })
  return supported
}

export const engine: NativeSpeechEngine = {
  speak,
  stop,
  getVoices,
  isLanguageSupported,
}

/**
 * Opens the engine's own screen for installing voice data, where Korean is
 * one download away.
 */
export async function openVoiceInstall(): Promise<void> {
  await TextToSpeech.openInstall()
}
