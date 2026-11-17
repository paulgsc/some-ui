/**
 * `/auth` on the viewer build (Pages; SIGNIN5, #3091): a viewer has no
 * sign-in to use, so the page says plainly that only the owner signs in,
 * and offers one way on, into the demo on sample data. No passkey wording.
 * Its words are `lib/auth/viewer-words`' alone.
 */
import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { useNavigate } from "@tanstack/react-router"

import { enterAccount, openDemo } from "@/lib/auth"
import { VIEWER_AUTH } from "@/lib/auth/viewer-words"

export const ViewerAuth = ({
  redirect = "/app",
}: {
  redirect?: string
}): JSX.Element => {
  const navigate = useNavigate()
  return (
    <main
      className={cn(
        "mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6"
      )}
    >
      <h1 className={cn("text-xl font-semibold")}>{VIEWER_AUTH.title}</h1>
      <p className={cn("text-muted-foreground text-sm")}>{VIEWER_AUTH.body}</p>
      <Button
        type="button"
        className={cn("self-start")}
        onClick={() => {
          openDemo()
          enterAccount(redirect, (href) => void navigate({ href }))
        }}
      >
        {VIEWER_AUTH.open}
      </Button>
    </main>
  )
}
