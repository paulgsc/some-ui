import { z } from "zod"

export type ZodReturnCase<T> =
  T extends z.SafeParseReturnType<
    z.objectInputType<{}, z.ZodTypeAny, "passthrough">,
    z.objectOutputType<{}, z.ZodTypeAny, "passthrough">
  >
    ? T["success"] extends true
      ? T["data"] extends undefined
        ? "data undefined"
        : "parsed successfully"
      : T["error"] extends undefined
        ? "invalid error"
        : "zod error"
    : "invalid type"


    export const GenericZodObjectSchema = z
  .object({})

  .passthrough()


  export type GenericZodObject = z.infer<typeof GenericZodObjectSchema>

    export function parseZodToken<T extends GenericZodObject>(t : T = GenericZodObjectSchema, payload: any) {
const parsedToken = 
    }