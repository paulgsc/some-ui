import { z } from "zod"

export const createEnumSchema = <T extends string>(
  values: Array<T>
): z.ZodEnum<[T, ...Array<T>]> => z.enum(values as [T, ...Array<T>])
