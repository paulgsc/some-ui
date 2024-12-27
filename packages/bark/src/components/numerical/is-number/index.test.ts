import { expectTypeOf, test } from "vitest"

import type { IsNumber } from "."

test("IsNumber correctly identifies '42' as a number", () => {
  expectTypeOf<IsNumber<"42">>().toEqualTypeOf<true>()
})

test("IsNumber correctly identifies '3.14' as a number", () => {
  expectTypeOf<IsNumber<"3.14">>().toEqualTypeOf<true>()
})

test("IsNumber correctly identifies 0 as a number", () => {
  expectTypeOf<IsNumber<0>>().toEqualTypeOf<true>()
})

test("IsNumber correctly identifies '-' as not a number", () => {
  expectTypeOf<IsNumber<"-">>().toEqualTypeOf<false>()
})

test("IsNumber correctly identifies '42foo' as not a number", () => {
  expectTypeOf<IsNumber<"42foo">>().toEqualTypeOf<false>()
})

test("IsNumber correctly identifies 'NaN' as not a number", () => {
  expectTypeOf<IsNumber<"NaN">>().toEqualTypeOf<false>()
})
