# `@some-ui/auth`

Authentication UI for a session-gated app: sign-in, sign-up, password reset,
code verification, and the gate that decides whether the app or the sign-in
flow renders.

Everything here is presentation. The package never issues a request, never
touches a cookie or `localStorage`, never imports a router, and never sees a
token. What it takes instead is a submit handler, a `pending` flag, and an
`error` string — so wiring it to an Axum backend, a mock, or a Storybook
harness is the same job.

## What lives here

**Workflow**

| Piece                      | What it is                                          |
| -------------------------- | --------------------------------------------------- |
| `AuthFlow`                 | Every step, including passkey enrollment, in a card |
| `SignInForm`               | Email + password + remember-me, optional providers  |
| `SignUpForm`               | Email + password + confirmation + terms             |
| `RequestPasswordResetForm` | Step one of reset — ask for the address             |
| `ResetPasswordForm`        | Step two of reset — set the new password            |
| `VerifyCodeForm`           | Second factor / email verification                  |
| `AuthGate`                 | Renders gated content only for a resolved session   |
| `AuthPageTemplate`         | Copy-friendly full-page or split-screen composition |

**Parts the forms are built from** — `AuthCard`, `AuthField`, `PasswordField`,
`CheckboxField`, `CodeInput`, `OAuthButtons`, `AuthSubmitButton`, `AuthError`.
`PasskeyButton` and `PasskeyEnrollment` expose passkey UX without invoking
WebAuthn: the host adapter owns challenge fetching, browser API calls, and
credential submission.

**Templates** — `AuthPageTemplate` composes the controlled flow into a static,
shadcn-style page with brand, aside, and footer slots. It is intentionally a
copy-friendly composition rather than an application shell or router. The
template is passkey-first by default: its initial sign-in surface is a single
passkey action, while email/password and OAuth stay behind an explicit backup
method link. Set `passkeyFirst={false}` for a conventional all-methods form.
The template defaults to the same seven-cell `AuthBrand` mark as the Some UI
favicon and adds a subtle CSS honeycomb lattice. Every colour outside the
fixed amber brand mark comes from the shared semantic tokens (`background`,
`foreground`, `card`, `muted`, `border`, `primary`, and their companions), so
the active Some Styles theme automatically reaches the complete auth surface.

**Hooks** — `useAuthForm` (values, zod validation on submit, per-field
messages) and `useAuthFlow` (step state for consumers with no router).

## Wiring it up

```tsx
import { AuthFlow, useAuthFlow } from "@some-ui/auth"

const SignInPage = () => {
  const { step, goTo } = useAuthFlow()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = async (values: SignInValues) => {
    setPending(true)
    setError(null)
    const response = await fetch("/api/session", {
      method: "POST",
      // The session cookie the server sets is what gates the backend.
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    })
    setPending(false)
    if (!response.ok) setError("Email or password is incorrect.")
  }

  return (
    <AuthFlow
      step={step}
      onStepChange={goTo}
      pending={pending}
      error={error}
      onSignIn={signIn} /* … */
    />
  )
}
```

`step` is a prop rather than internal state on purpose. These steps want to be
URLs — a reset email has to link straight to `reset-password`, and a reload
mid-flow should land where the user was — which means the router owns the step.
`useAuthFlow` is the fallback for callers that have no router yet.

## Three things this package assumes of the server

These are not enforceable from the client, but the components are shaped
around them:

1. **The session credential is an `HttpOnly; Secure; SameSite` cookie.** No
   component here can read, write, or persist one, so there is nothing for an
   XSS payload to exfiltrate from this layer. Requests carry it because the
   browser attaches it, not because JavaScript does.
2. **Failures are vague on purpose.** `AuthError` renders whatever the server
   sends. A sign-in error that distinguishes "no such user" from "wrong
   password", or a reset screen that admits an address is unregistered, turns
   the form into an account-enumeration oracle.
3. **`AuthGate` is not a security boundary.** Anything behind it is already in
   the downloaded bundle, and `status` is a prop a viewer can flip. Every
   request the gated content makes must be independently authorized. The gate
   exists to stop a signed-out user staring at an interface that will 401 on
   contact.

## Local conventions worth knowing

- **No react-hook-form.** `useAuthForm` is ~50 lines: values, zod on submit,
  a `Map` of per-field messages. RHF earns its keep on a 40-field settings
  page; an auth form has four fields, and adding it would put a second form
  idiom into a workspace that has none.
- **`CheckboxField` is local, not in `@some-ui/shared`.** One consumer, so
  `packages/SHARED_WORKSPACE_DOCTRINE.md` §2 keeps it here. If a second
  workspace needs a checkbox, the defense test applies then, and what moves is
  a Radix-backed primitive rather than this.
- **`Map`, `.at()`, and sibling traversal.** This repo's ESLint config bans all
  computed member access, which takes `errors[name]` and `refs[i].focus()` off
  the table. Hence the `Map` of field errors, and a `CodeInput` that walks
  `nextElementSibling` rather than indexing a ref array.
