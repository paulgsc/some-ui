import { z } from "zod"

export const GenericZodObjectSchema = z
  .object({})

  .passthrough()

export type Foo = z.infer<typeof GenericZodObjectSchema>

const foo = GenericZodObjectSchema.safeParse("")
foo.data

export const OAuth2UniversalSchema = GenericZodObjectSchema.extend({
  /**
   * If we aren't sent refresh_token, it means that the party syncing us the credentials don't want us to ever refresh the token.
   * They would be responsible to send us the access_token before it expires.
   */
  refresh_token: z.string().optional(),

  /**
   * It is only needed when connecting to the API for the first time. So, it is okay if the party syncing us the credentials don't send it as then it is responsible to provide us the access_token already
   */
  scope: z.string().optional(),

  /**
   * Absolute expiration time in milliseconds
   */
  expiry_date: z.number().optional(),
})

export type Bar = z.infer<typeof OAuth2UniversalSchema>
