import { z } from "zod"

export const createEnumSchema = <T extends string>(values: [T, ...Array<T>]) =>
  z.enum(values)
