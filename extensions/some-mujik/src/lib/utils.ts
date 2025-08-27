import { clsx, type ClassValue } from "clsx"

export function cn(...inputs: Array<ClassValue>) {
  return clsx(inputs)
}
