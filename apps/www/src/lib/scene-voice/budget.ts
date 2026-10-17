import { SOUNDBITE_TAKE_MAX_BYTES } from "@some-ui/soundbites/contract"

/** Notes one draft holds: a scene told in five minutes, a minute a take. */
export const SCENE_NOTES_MAX = 5

/**
 * The most audio a scene draft may hold: its notes, each at most a minute at
 * the soundbites' bitrate.
 */
export const SCENE_AUDIO_MAX_BYTES = SCENE_NOTES_MAX * SOUNDBITE_TAKE_MAX_BYTES
