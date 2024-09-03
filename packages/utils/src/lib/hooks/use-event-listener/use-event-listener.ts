/*
 * This file contains code adapted from the Node.js website repository,
 * available at: https://github.com/nodejs/nodejs.org
 * The original code is licensed under the MIT License.
 */

/*global WindowEventMap, AddEventListenerOptions*/

import { useEffect, useRef, type RefObject } from "react"
import { useIsomorphicLayoutEffect } from "@utils/lib/hooks/use-isomorphic"

function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element?: undefined,
  options?: boolean | AddEventListenerOptions
): void

// Overload for Element event listener
function useEventListener<
  KW extends keyof WindowEventMap,
  T extends HTMLElement | SVGAElement | MediaQueryList = HTMLElement,
>(
  eventName: KW,
  handler: (event: WindowEventMap[KW]) => void,
  element?: RefObject<T>,
  options?: boolean | AddEventListenerOptions
): void

// Implementation of useEventListener
function useEventListener<
  KW extends keyof WindowEventMap,
  T extends HTMLElement | SVGAElement | MediaQueryList = HTMLElement,
>(
  eventName: KW,
  handler: (event: WindowEventMap[KW] | Event) => void,
  element?: RefObject<T>,
  options?: boolean | AddEventListenerOptions
): void {
  const savedHandler = useRef(handler)

  useIsomorphicLayoutEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    const targetElement: T | Window = element?.current ?? window

    const listener: typeof handler = (event) => {
      savedHandler.current(event)
    }

    targetElement.addEventListener(eventName, listener, options)

    return (): void => {
      targetElement.removeEventListener(eventName, listener, options)
    }
  }, [eventName, element, options])
}

export { useEventListener }
