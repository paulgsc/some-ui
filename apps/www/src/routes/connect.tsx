/**
 * The approval page an AI service sends the person to (paulgsc/server's
 * `OAUTH_AUTHORIZE_URL`): who is asking, where the answer goes and what it
 * allows, then Allow or Decline. It is on this app's origin because that is
 * where the passkeys are; the steps and the reasons are the machine's
 * (`lib/oauth/connect.ts`), and this component only shows its state and
 * passes on the person's presses.
 *
 * Signing in here is the same ceremony as `/auth`'s, so it also makes the
 * account where this browser's sessions live. Unlike `/auth` it is not
 * followed by a page load into the account: Allow then leaves the app for the
 * service, which is a page load of its own.
 *
 * Not on the Android app's surface (`lib/app-surface`): the phone has no
 * account on the server and no passkey for it.
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/intent-kit"
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@some-ui/shared"
import { createFileRoute } from "@tanstack/react-router"

import { describeAuthError, resolveSession, signIn } from "@/lib/auth"
import { createApprovalClient } from "@/lib/oauth/client"
import type { ConnectState, Unusable } from "@/lib/oauth/connect"
import type { ConnectRuntime } from "@/lib/oauth/connect-runtime"
import { createConnect } from "@/lib/oauth/connect-runtime"
import { describeScope } from "@/lib/oauth/scopes"

const UNUSABLE: Record<
  Unusable["reason"],
  (unusable: Unusable) => { title: string; description: string }
> = {
  framed: () => ({
    title: "Open this page on its own",
    description:
      "It was opened inside another page, where a press on Allow could be someone else's. Open the link in its own tab to answer.",
  }),
  "no-server": () => ({
    title: "Nothing to connect to",
    description:
      "This build of Some UI has no server, so no AI service can connect to it.",
  }),
  "no-request": () => ({
    title: "No request to answer",
    description:
      "This page answers an AI service that asks to connect. Start from the service's own settings, and it sends you here.",
  }),
  refused: (unusable) => ({
    title: "This request can't be answered",
    description: `${
      unusable.reason === "refused" && unusable.refusal.description !== null
        ? `The server says: ${unusable.refusal.description}. `
        : ""
    }Start connecting again from the AI service.`,
  }),
  "not-configured": () => ({
    title: "AI services aren't set up here",
    description:
      "This server doesn't accept AI services. Whoever runs it can turn them on.",
  }),
  unreachable: () => ({
    title: "The server can't be reached",
    description:
      "Approving an AI service happens where your passkey works: on the network this server is on. Try again from there.",
  }),
  expired: () => ({
    title: "This request has ended",
    description:
      "It expired or was already answered. Start connecting again from the AI service.",
  }),
}

const Asking = ({
  state,
  runtime,
}: {
  state: Extract<
    ConnectState,
    { kind: "asking" } | { kind: "signing-in" } | { kind: "answering" }
  >
  runtime: ConnectRuntime
}): JSX.Element => {
  const { approval } = state
  const busy = state.kind !== "asking"
  const signedIn = state.kind === "asking" && state.session === "signed-in"
  const allowLabel =
    state.kind === "signing-in"
      ? "Waiting for your passkey..."
      : state.kind === "answering" && state.answer === "approve"
        ? "Allowing..."
        : signedIn
          ? "Allow"
          : "Sign in and allow"

  return (
    <>
      <CardHeader>
        <CardTitle>Connect {approval.clientName}?</CardTitle>
        <CardDescription>
          {approval.clientName} asks to act for you here. It never learns who
          you are: the server gives it a key that names your account&apos;s
          random ID and nothing else.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">It will be able to:</p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            {approval.scopes.map((scope) => (
              <li key={scope}>{describeScope(scope)}</li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground text-sm">
          Your answer goes back to{" "}
          <span className="text-foreground font-medium">
            {approval.redirectHost}
          </span>
          . You can disconnect it any time in Settings.
        </p>
        {state.kind === "asking" && state.notice !== null ? (
          <Alert variant="destructive" className="py-2">
            <AlertDescription>{state.notice}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => runtime.dispatch({ type: "approve" })}
        >
          {allowLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => runtime.dispatch({ type: "deny" })}
        >
          {state.kind === "answering" && state.answer === "deny"
            ? "Declining..."
            : "Decline"}
        </Button>
      </CardFooter>
    </>
  )
}

const Body = ({
  state,
  runtime,
}: {
  state: ConnectState
  runtime: ConnectRuntime
}): JSX.Element => {
  switch (state.kind) {
    case "idle":
    case "opening": {
      return (
        <CardContent className="space-y-3 pt-[var(--card-p,1.5rem)]">
          <p className="text-muted-foreground text-sm">
            Reading the request...
          </p>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      )
    }
    case "asking":
    case "signing-in":
    case "answering": {
      return <Asking state={state} runtime={runtime} />
    }
    case "leaving": {
      return (
        <CardHeader>
          <CardTitle>
            {state.answer === "approve"
              ? "Connected"
              : state.answer === "deny"
                ? "Declined"
                : "Not connected"}
          </CardTitle>
          <CardDescription>
            Taking you back to {state.host ?? "the AI service"}...
          </CardDescription>
        </CardHeader>
      )
    }
    case "unusable": {
      const { title, description } = UNUSABLE[state.reason](state)
      return (
        <>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          {state.reason === "unreachable" ? (
            <CardFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => runtime.dispatch({ type: "retry" })}
              >
                Try again
              </Button>
            </CardFooter>
          ) : null}
        </>
      )
    }
    default: {
      return assertNever(state)
    }
  }
}

const ConnectPage = (): JSX.Element => {
  const [runtime] = useState(() =>
    createConnect({
      client: createApprovalClient(),
      hasSession: resolveSession,
      signIn,
      describeSignInError: (error) => describeAuthError(error, "sign-in"),
      go: (url) => window.location.assign(url),
    })
  )
  useEffect(
    () =>
      runtime.attach({
        search: window.location.search,
        framed: window.self !== window.top,
      }),
    [runtime]
  )
  const state = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )

  return (
    <main className="bg-background text-foreground flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <Body state={state} runtime={runtime} />
      </Card>
    </main>
  )
}

export const Route = createFileRoute("/connect")({ component: ConnectPage })
