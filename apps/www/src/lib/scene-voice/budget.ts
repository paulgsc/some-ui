import { SOUNDBITE_TAKE_MAX_BYTES } from "@some-ui/soundbites/contract"

/** Notes one draft holds: a scene told in five minutes, a minute a take. */
export const SCENE_NOTES_MAX = 5

/**
 * Notes the phone keeps of every scene: the draft's, and those set aside or
 * recorded again until home holds them (MIC5). Past it, a new note makes room
 * by letting go the oldest home holds that has left the draft, and is
 * refused while there is none.
 */
export const SCENE_NOTES_KEPT = 20

/**
 * The most audio the scene notes may hold: those the phone keeps, each at
 * most a minute at the soundbites' bitrate.
 */
export const SCENE_AUDIO_MAX_BYTES = SCENE_NOTES_KEPT * SOUNDBITE_TAKE_MAX_BYTES
