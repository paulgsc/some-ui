import { SOUNDBITE_TAKE_MAX_BYTES } from "@some-ui/soundbites/contract"

import { REFLECTION_LIMIT } from "@/lib/session-reflection/policy"

/**
 * The most audio voice reflections may hold: k notes, each at most a minute
 * at the soundbites' bitrate. Their own cap, beside the soundbites': a voice
 * reflection counts toward k, never toward the soundbites' six.
 */
export const REFLECTION_AUDIO_MAX_BYTES =
  REFLECTION_LIMIT * SOUNDBITE_TAKE_MAX_BYTES
