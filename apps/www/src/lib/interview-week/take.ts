/**
 * How the interview week records a take: up to 2 minutes (owner, 2026-11-13),
 * no count of its own, each waiting on this phone until the week is sent.
 * The phone's desk (`./index`) and the tests' simulated microphone
 * (`__tests__/fixture`) both record under these, so a page measured in a test
 * shows the cap the phone does (IW18).
 */
import { TAKE_MAX_SECONDS } from "@some-ui/interview-week"
import type { TakePatternOptions } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"

import type { DeskShape } from "@/lib/takes-desk/pattern"
import { deskPatternOptions } from "@/lib/takes-desk/pattern"
import type { TakeLimits } from "@/lib/takes-desk/runtime"

export const INTERVIEW_TAKE_LIMITS: TakeLimits = {
  max: Number.POSITIVE_INFINITY,
  maxMs: TAKE_MAX_SECONDS * 1000,
}

export const INTERVIEW_TAKE_SHAPE: DeskShape = {
  takes: ONE_TAKE.takes,
  play: ONE_TAKE.play,
  send: "on-confirm",
}

/** The take pattern's options, as the phone's desk makes them. */
export const INTERVIEW_TAKE: TakePatternOptions = deskPatternOptions(
  INTERVIEW_TAKE_LIMITS,
  INTERVIEW_TAKE_SHAPE
)
