import type { SyntheticEvent } from "react"
import { useCallback, useState } from "react"
import type { ZodType } from "zod"

import type { FieldErrors } from "../lib/field-errors"
import { EMPTY_FIELD_ERRORS, toFieldErrors } from "../lib/field-errors"

export type UseAuthFormOptions<TValues extends object> = {
  schema: ZodType<TValues>
  initialValues: TValues
  /** Called with parsed, schema-valid values. Never called on failure. */
  onSubmit: (values: TValues) => void
}

export type UseAuthForm<TValues extends object> = {
  values: TValues
  errors: FieldErrors
  /** Merge a partial update — `update({ email })`, not `set("email", value)`. */
  update: (patch: Partial<TValues>) => void
  handleSubmit: (event: SyntheticEvent<HTMLFormElement>) => void
  reset: () => void
}

/**
 * The whole form layer for this package: values, zod validation on submit,
 * per-field messages.
 *
 * Deliberately not react-hook-form. RHF's value comes from uncontrolled
 * registration and subscription-level re-render control, which is worth a
 * dependency for a 40-field settings page — an auth form has four fields and
 * re-renders on keystroke either way. Adding RHF here would also put a second
 * form idiom into a 61-package workspace that currently has none.
 *
 * Validation runs on submit only, not on change. Marking a half-typed email
 * invalid before the user has finished typing it is the most common way these
 * forms feel hostile; errors clear on the next successful submit.
 */
export const useAuthForm = <TValues extends object>({
  schema,
  initialValues,
  onSubmit,
}: UseAuthFormOptions<TValues>): UseAuthForm<TValues> => {
  const [values, setValues] = useState<TValues>(initialValues)
  const [errors, setErrors] = useState<FieldErrors>(EMPTY_FIELD_ERRORS)

  const update = useCallback((patch: Partial<TValues>): void => {
    setValues((current) => ({ ...current, ...patch }))
  }, [])

  const handleSubmit = useCallback(
    (event: SyntheticEvent<HTMLFormElement>): void => {
      event.preventDefault()

      const result = schema.safeParse(values)
      if (!result.success) {
        setErrors(toFieldErrors(result.error))
        return
      }

      setErrors(EMPTY_FIELD_ERRORS)
      onSubmit(result.data)
    },
    [schema, values, onSubmit]
  )

  const reset = useCallback((): void => {
    setValues(initialValues)
    setErrors(EMPTY_FIELD_ERRORS)
  }, [initialValues])

  return { values, errors, update, handleSubmit, reset }
}
