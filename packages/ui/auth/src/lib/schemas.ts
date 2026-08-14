import { z } from "zod"

/**
 * Length-only password policy, following NIST SP 800-63B: a long passphrase
 * beats a short string with a symbol bolted on, and composition rules mostly
 * teach people to write `Password1!`. The upper bound is not a security
 * measure — it stops a multi-megabyte body reaching the server's hasher.
 */
const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_LENGTH = 128

/** Digits in an emailed / TOTP verification code. */
export const VERIFICATION_CODE_LENGTH = 6

/**
 * `z.email()` rather than `z.string().email()`: the chained form is marked
 * `@deprecated` in zod 4, and `@typescript-eslint/no-deprecated` is an error
 * in this repo.
 */
export const emailSchema = z.email("Enter a valid email address.")

/** Applies to passwords being *set*. Sign-in only checks for non-empty. */
export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters.`)

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. A passphrase works well.`

export const signInSchema = z.object({
  email: emailSchema,
  /**
   * Not `newPasswordSchema`. Validating an existing password against the
   * current policy tells an attacker the policy changed, and locks out users
   * whose password predates it — the server decides whether it is right.
   */
  password: z.string().min(1, "Enter your password."),
  rememberMe: z.boolean(),
})

export type SignInValues = z.infer<typeof signInSchema>

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
    acceptedTerms: z
      .boolean()
      .refine((accepted) => accepted, "Accept the terms to continue."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

export type SignUpValues = z.infer<typeof signUpSchema>

export const requestResetSchema = z.object({
  email: emailSchema,
})

export type RequestResetValues = z.infer<typeof requestResetSchema>

export const resetPasswordSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .length(
      VERIFICATION_CODE_LENGTH,
      `Enter all ${VERIFICATION_CODE_LENGTH} digits.`
    ),
})

export type VerifyCodeValues = z.infer<typeof verifyCodeSchema>
