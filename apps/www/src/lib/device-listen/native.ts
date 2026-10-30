/**
 * The app's own `Listen` plugin (`apps/mobile`'s `ListenPlugin.java`). Only
 * ever imported dynamically, by `./index`, in the device build.
 *
 * Never resolve `Listen` itself from a promise: a Capacitor plugin proxy
 * answers every property, `then` included. Call through these functions,
 * which hand back the plugin's own promises unawaited, so every wait is in
 * `./index`'s `callForeign`.
 */
import type { PluginListenerHandle } from "@capacitor/core"
import { registerPlugin } from "@capacitor/core"

type ListenPlugin = {
  available: () => Promise<{ available: boolean }>
  /** Resolves with the words heard, empty when nothing was. */
  start: () => Promise<{ words: string }>
  stop: () => Promise<void>
  cancel: () => Promise<void>
  addListener: ((
    event: "words",
    listener: (heard: { words: string }) => void
  ) => Promise<PluginListenerHandle>) &
    ((
      /** The microphone prompt is up, or the recognizer is listening. */
      event: "asking" | "ready",
      listener: () => void
    ) => Promise<PluginListenerHandle>)
}

const Listen = registerPlugin<ListenPlugin>("Listen")

export function available(): Promise<{ available: boolean }> {
  return Listen.available()
}

export function start(): Promise<{ words: string }> {
  return Listen.start()
}

export function stop(): Promise<void> {
  return Listen.stop()
}

export function cancel(): Promise<void> {
  return Listen.cancel()
}

export function onWords(
  listener: (words: string) => void
): Promise<PluginListenerHandle> {
  return Listen.addListener("words", ({ words }) => listener(words))
}

/** The microphone prompt went up: a person is answering it. */
export function onAsking(listener: () => void): Promise<PluginListenerHandle> {
  return Listen.addListener("asking", listener)
}

/** The recognizer is listening. */
export function onReady(listener: () => void): Promise<PluginListenerHandle> {
  return Listen.addListener("ready", listener)
}
