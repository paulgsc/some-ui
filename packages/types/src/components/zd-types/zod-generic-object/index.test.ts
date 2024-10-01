import { z } from "zod"

export const GenericZodObjectSchema = z
  .object({})

  .passthrough()
