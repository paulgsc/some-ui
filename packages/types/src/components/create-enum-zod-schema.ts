import { z } from "zod"

export const createEnumSchema = <T extends string>(
  values: [T, ...Array<T>]
): z.ZodEnum<{ [K in T]: K }> => z.enum(values)
