# ADR 0001 — Video-timestamp anchoring for reaction records

- **Status:** Accepted
- **Date:** 2026-06-21

## Context

The drama sentiment tracker records emotional reactions during video playback. The reaction must be meaningful when replayed later — "this made me gasp" is only useful if the user can find exactly where in the episode it happened.

Two timestamp options: wall-clock time (when the user tapped the emoji) or video timestamp (the position in the video at the moment of capture).

## Decision

Anchor reaction records to the **video timestamp** (seconds into the video), not wall-clock time. The record schema is `(drama, episode, video_timestamp_seconds, emotion, intensity, notes)`.

## Trade-offs accepted

- Requires extracting the video timestamp from the host page DOM at capture time. This is page-structure-dependent and may break if the streaming platform changes its DOM.
- If the user pauses and then taps, the video timestamp is the paused position — which is correct (the reaction was to the paused frame), but may feel counterintuitive.

## Alternatives rejected

- **Wall-clock timestamp:** useful for session analytics but useless for finding the moment in the video. A user cannot replay episode 12 and seek to 14:32:05 PM. Rejected.
- **Both timestamps:** adds schema complexity for marginal benefit. If wall-clock analytics are needed later, they can be derived from the session start time + video timestamp. Deferred.
