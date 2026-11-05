import type { JSX } from "react"
import { STUDIO_WORDS } from "@some-ui/soundbites"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"

/**
 * Studio's way to pairing, on a phone never paired with home (STUDIO ST34):
 * Settings' Home page, where the phone pairs. Studio's screens draw it under
 * what they can't do until then. That page is the phone's ("apk"), so a
 * build without it draws nothing (A3, packages/some-vite-config/AUDIENCES.md).
 */
export const PairHomeLink = (): JSX.Element | null =>
  hasAudience("apk") ? (
    <Link
      to="/settings/home"
      className="text-brand self-start text-sm font-semibold underline underline-offset-4"
    >
      {STUDIO_WORDS.pair.pair}
    </Link>
  ) : null
