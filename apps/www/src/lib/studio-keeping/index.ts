/**
 * What Studio's screens hand to the home link (STUDIO ST9, ST12).
 * `@some-ui/soundbites` is the phone's alone, so only Studio's screens import
 * it (packages/some-vite-config/AUDIENCES.md): Studio and Ideas on home hand
 * its store, log and rules in here (`keepStudio`, with soundbites'
 * `phoneStudioKeeping`), and the voice and send lanes (`lib/home-link`) read
 * them, naming soundbites' types alone. This module calls nothing of the
 * link and sends nothing: it only holds what was handed in, the first
 * hand-in standing. Until one of those screens has loaded in this run of the
 * app, the lanes carry nothing of Studio's, and its record waits on the
 * phone for the next send after it has.
 */
import type { StudioKeeping } from "@some-ui/soundbites"

import { handedIn } from "@/lib/handed-in"

const studio = handedIn<StudioKeeping>()

/** A Studio screen hands its pieces in; the lanes then carry its record. */
export const keepStudio = studio.keep

/** Studio's pieces, once its route has handed them in; null until then. */
export const studioKeeping = studio.kept

/** Calls `listener` once Studio's pieces are handed in. */
export const onStudioKept = studio.onKept
