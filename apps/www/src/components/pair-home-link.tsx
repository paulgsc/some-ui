import type { JSX } from "react"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"

/**
 * Studio's way to pairing, on a phone never paired with home (STUDIO ST34):
 * Settings' Home page, where the phone pairs. Studio's screens draw it under
 * what they can't do until then. That page is the phone's ("apk"), so a
 * build without it draws nothing (A3, packages/some-vite-config/AUDIENCES.md).
 * Its words are the caller's, so this module needs no phone-only workspace.
 */
export const PairHomeLink = ({
  children,
}: {
  children: string
}): JSX.Element | null =>
  hasAudience("apk") ? (
    <Link
      to="/settings/home"
      className="text-brand self-start text-sm font-semibold underline underline-offset-4"
    >
      {children}
    </Link>
  ) : null
