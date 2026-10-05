/**
 * @module adapters/backend
 *
 * A backend as the app hands it to the session: a token, not a factory.
 *
 * Each real backend lives in its own package entry (`@some-ui/speech/http`,
 * `/web-speech`, `/native`), so a build carries only the ones its app
 * imports. The app picks them and passes them in `SpeechConfig.adapters`;
 * this package never imports one itself, or every build would carry all
 * three.
 *
 * What an entry exports is inert. Only the session (`./registry`) can read
 * the factory behind it, because the key it sits under is not exported. An
 * applet that imported an entry could otherwise build its own adapter and
 * speak outside the page's session, with its own voice and deaf to mute,
 * which is what Honeycomb did.
 */

import type { SpeechAdapterFactory } from "./registry"

const FACTORY: unique symbol = Symbol("speech backend")

export type SpeechBackend = {
  readonly [FACTORY]: SpeechAdapterFactory
}

/** Wraps one of this package's own factories for an entry to export. */
export function defineSpeechBackend(
  factory: SpeechAdapterFactory
): SpeechBackend {
  return { [FACTORY]: factory }
}

/** The factory behind a backend. The session's alone. */
export function factoryOf(backend: SpeechBackend): SpeechAdapterFactory {
  return backend[FACTORY]
}
