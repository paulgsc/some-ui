import { EmptyArray, FalseyValues, IterType, T, Val, isTruthy } from "./common"
import { Err, Ok, Result } from "./result"

export type Some<T> = OptionType<T> & { [T]: true }
export type None = OptionType<never> & { [T]: false }
export type Option<T> = OptionType<T>

type From<T> = Exclude<T, Error | FalseyValues>

type OptionTypes<O> = {
  [K in keyof O]: O[K] extends Option<infer T> ? T : never
}

class OptionType<T> {
  readonly [T]: boolean
  readonly [Val]: T

  constructor(val: T, some: boolean) {
    this[T] = some
    this[Val] = val
  }

  [Symbol.iterator](this: Option<T>): IterType<T> {
    return this[T]
      ? (this[Val] as any)[Symbol.iterator]()
      : EmptyArray[Symbol.iterator]()
  }

  into(this: Option<T>): T | undefined
  into<U extends FalseyValues>(this: Option<T>, none: U): T | U
  into(this: Option<T>, none?: FalseyValues): T | FalseyValues {
    return this[T] ? this[Val] : none
  }

  isLike(this: Option<T>, cmp: unknown): cmp is Option<unknown> {
    return cmp instanceof OptionType && this[T] === cmp[T]
  }

  isSome(this: Option<T>): this is Some<T> {
    return this[T]
  }

  isNone(this: Option<T>): this is None {
    return !this[T]
  }

  filter(this: Option<T>, f: (val: T) => boolean): Option<T> {
    return this[T] && f(this[Val]) ? this : None
  }

  flatten<U>(this: Option<Option<U>>): Option<U> {
    return this[T] ? this[Val] : None
  }

  expect(this: Option<T>, msg: string): T {
    if (this[T]) {
      return this[Val]
    } else {
      throw new Error(msg)
    }
  }

  unwrap(this: Option<T>): T {
    return this.expect("Failed to unwrap Option (found None)")
  }

  unwrapOr(this: Option<T>, def: T): T {
    return this[T] ? this[Val] : def
  }

  unwrapOrElse(this: Option<T>, f: () => T): T {
    return this[T] ? this[Val] : f()
  }

  unwrapUnchecked(this: Option<T>): T | undefined {
    return this[Val]
  }

  or(this: Option<T>, optb: Option<T>): Option<T> {
    return this[T] ? this : optb
  }

  orElse(this: Option<T>, f: () => Option<T>): Option<T> {
    return this[T] ? this : f()
  }

  and<U>(this: Option<T>, optb: Option<U>): Option<U> {
    return this[T] ? optb : None
  }

  andThen<U>(this: Option<T>, f: (val: T) => Option<U>): Option<U> {
    return this[T] ? f(this[Val]) : None
  }

  map<U>(this: Option<T>, f: (val: T) => U): Option<U> {
    return this[T] ? new OptionType(f(this[Val]), true) : None
  }

  mapOr<U>(this: Option<T>, def: U, f: (val: T) => U): U {
    return this[T] ? f(this[Val]) : def
  }

  mapOrElse<U>(this: Option<T>, def: () => U, f: (val: T) => U): U {
    return this[T] ? f(this[Val]) : def()
  }

  okOr<E>(this: Option<T>, err: E): Result<T, E> {
    return this[T] ? Ok(this[Val]) : Err(err)
  }

  okOrElse<E>(this: Option<T>, f: () => E): Result<T, E> {
    return this[T] ? Ok(this[Val]) : Err(f())
  }
}

export function Option<T>(val: T): Option<From<T>> {
  return from(val)
}

Option.is = is
Option.from = from
Option.nonNull = nonNull
Option.qty = qty
Option.safe = safe
Option.all = all
Option.any = any

export function Some<T>(val: T): Some<T> {
  return new OptionType(val, true) as Some<T>
}

export const None = Object.freeze(
  new OptionType<never>(undefined as never, false)
)

function is(val: unknown): val is Option<unknown> {
  return val instanceof OptionType
}

function from<T>(val: T): Option<From<T>> {
  return isTruthy(val) && !(val instanceof Error) ? (Some(val) as any) : None
}

function nonNull<T>(val: T): Option<NonNullable<T>> {
  return val === undefined || val === null || val !== val
    ? None
    : Some(val as NonNullable<T>)
}

function qty<T extends number>(val: T): Option<number> {
  return val >= 0 && Number.isInteger(val) ? Some(val) : None
}

function safe<T, A extends any[]>(
  fn: (...args: A) => T extends PromiseLike<any> ? never : T,
  ...args: A
): Option<T>
function safe<T>(promise: Promise<T>): Promise<Option<T>>
function safe<T, A extends any[]>(
  fn: ((...args: A) => T) | Promise<T>,
  ...args: A
): Option<T> | Promise<Option<T>> {
  if (fn instanceof Promise) {
    return fn.then(
      (val) => Some(val),
      () => None
    )
  }

  try {
    return Some(fn(...args))
  } catch {
    return None
  }
}

function all<O extends Option<any>[]>(...options: O): Option<OptionTypes<O>> {
  const some = []
  for (const option of options) {
    if (option.isSome()) {
      some.push(option.unwrapUnchecked())
    } else {
      return None
    }
  }

  return Some(some) as Some<OptionTypes<O>>
}

function any<O extends Option<any>[]>(
  ...options: O
): Option<OptionTypes<O>[number]> {
  for (const option of options) {
    if (option.isSome()) {
      return option as Option<OptionTypes<O>[number]>
    }
  }
  return None
}
