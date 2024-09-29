/*
 * Adapted from the honeycomb package (https://github.com/flauwekeul/honeycomb)
 * Original code by the honeycomb contributors under the MIT License.
 *
 * This code has been modified to use TypeScript types and follow a functional style,
 * without using classes.
 *
 */

// for reference
// const isNumber = (value: unknown): value is number => Number.isFinite(value) && !Number.isNaN(value)

export type IsNumber<T> = T extends number
  ? true
  : T extends `${number}`
    ? true
    : false
