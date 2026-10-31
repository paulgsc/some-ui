/**
 * The phone's Jobs wing (`./runtime`): one runtime per page load, its
 * record in this device's storage, its voice notes on a shelf of their own,
 * its files and notes to home by the home link (`lib/home-link/jobs`,
 * `lib/home-link/voice-copy`). Phone-only (`build.paths.ts`).
 */
import { dayOf } from "@some-ui/core-utils"
import {
  SOUNDBITE_BITS_PER_SECOND,
  SOUNDBITE_TAKE_MAX_BYTES,
} from "@some-ui/soundbites/contract"
import { micRecorder, savingShelf } from "@some-ui/voice-capture"

import { MOBILE_APP } from "@/lib/build-profile"
import { browserLocalStorage } from "@/lib/tenant/storage"

import { nativeNotice } from "./notice-native"
import type { JobsRuntime } from "./runtime"
import { createJobsRuntime } from "./runtime"

/**
 * Room for the voice notes not yet let go: a minute each, up to forty. A
 * note leaves once home holds it (LG1).
 */
const JOB_VOICE_MAX_BYTES = 40 * SOUNDBITE_TAKE_MAX_BYTES

const shelf = savingShelf({
  dbName: "some-ui.job-voice",
  maxBytes: JOB_VOICE_MAX_BYTES,
})

/** The voice notes' audio, by note id, for the home link's voice lane. */
export const jobVoiceAudio = shelf.shelf

let jobs: JobsRuntime | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneJobs(): JobsRuntime {
  if (jobs === null) {
    jobs = createJobsRuntime({
      storage: browserLocalStorage,
      audio: shelf.shelf(),
      saving: shelf.saving,
      isSaving: shelf.isSaving,
      startRecording: micRecorder({
        bitsPerSecond: SOUNDBITE_BITS_PER_SECOND,
      }),
      now: () => new Date(),
      dayOf,
      newId: () => crypto.randomUUID(),
      ...(MOBILE_APP ? { notice: nativeNotice } : {}),
    })
    jobs.sweep()
  }
  return jobs
}

export type { JobsSnapshot } from "./runtime"
