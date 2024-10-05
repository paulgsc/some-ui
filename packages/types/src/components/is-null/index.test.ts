import { describe, expect, expectTypeOf, it, test } from "vitest"

import { IsNil, IsNull, isNil, isNull } from "."

// Update the path as needed

describe("isNull function", () => {
  it("should return true for null", () => {
    expect(isNull(null)).toBe(true)
  })

  it("should return false for undefined", () => {
    expect(isNull(undefined)).toBe(false)
  })

  it("should return false for non-null values", () => {
    expect(isNull(0)).toBe(false)
    expect(isNull("")).toBe(false)
    expect(isNull([])).toBe(false)
    expect(isNull({})).toBe(false)
    expect(isNull(false)).toBe(false)
  })
})

describe("isNil function", () => {
  it("should return true for null", () => {
    expect(isNil(null)).toBe(true)
  })

  it("should return true for undefined", () => {
    expect(isNil(undefined)).toBe(true)
  })

  it("should return false for non-null and non-undefined values", () => {
    expect(isNil(0)).toBe(false)
    expect(isNil("")).toBe(false)
    expect(isNil([])).toBe(false)
    expect(isNil({})).toBe(false)
    expect(isNil(false)).toBe(false)
  })
})

test("IsNull correctly identifies 'null' as null", () => {
  expectTypeOf<IsNull<null>>().toEqualTypeOf<true>()
})

test("IsNull correctly identifies 'undefined' as not null", () => {
  expectTypeOf<IsNull<undefined>>().toEqualTypeOf<false>()
})

test("IsNull correctly identifies '42' as not null", () => {
  expectTypeOf<IsNull<42>>().toEqualTypeOf<false>()
})

test("IsNil correctly identifies 'null' as nil", () => {
  expectTypeOf<IsNil<null>>().toEqualTypeOf<true>()
})

test("IsNil correctly identifies 'undefined' as nil", () => {
  expectTypeOf<IsNil<undefined>>().toEqualTypeOf<true>()
})

test("IsNil correctly identifies '42' as not nil", () => {
  expectTypeOf<IsNil<42>>().toEqualTypeOf<false>()
})

test("IsNil correctly identifies 'string' as not nil", () => {
  expectTypeOf<IsNil<string>>().toEqualTypeOf<false>()
})
