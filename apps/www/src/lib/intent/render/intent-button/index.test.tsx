/**
 * @vitest-environment jsdom
 */

import { failed, idle, succeeded, working } from "@some-ui/intent-kit"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IntentButton } from "."

afterEach(() => {
  cleanup()
})

describe("IntentButton", () => {
  it("idle: renders the idle label, enabled, and calls onPress", () => {
    const onPress = vi.fn()
    render(
      <IntentButton
        state={idle()}
        onPress={onPress}
        idleLabel="Save"
        workingLabel="Saving..."
      />
    )

    const button = screen.getByRole("button", { name: "Save" })
    expect(button.hasAttribute("disabled")).toBe(false)
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("working: disables and swaps the label, and no failure affordance is present", () => {
    render(
      <IntentButton
        state={working()}
        onPress={vi.fn()}
        idleLabel="Save"
        workingLabel="Saving..."
      />
    )

    const button = screen.getByRole("button", { name: "Saving..." })
    expect(button.hasAttribute("disabled")).toBe(true)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("working with a step: workingStepLabel wins over the plain workingLabel", () => {
    render(
      <IntentButton
        state={working<never, "create" | "activate">("activate")}
        onPress={vi.fn()}
        idleLabel="Save & Play"
        workingLabel="Working..."
        workingStepLabel={(step) =>
          step === "create"
            ? "Saving..."
            : step === "activate"
              ? "Starting..."
              : undefined
        }
      />
    )

    expect(screen.getByRole("button", { name: "Starting..." })).toBeTruthy()
  })

  it("succeeded: re-enables to the idle label by default, still calls onPress (resubmittable)", () => {
    const onPress = vi.fn()
    render(
      <IntentButton
        state={succeeded("ok")}
        onPress={onPress}
        idleLabel="Save"
        workingLabel="Saving..."
      />
    )

    const button = screen.getByRole("button", { name: "Save" })
    expect(button.hasAttribute("disabled")).toBe(false)
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("failed and retryable: replaces the original action with one Try again control", () => {
    const retry = vi.fn()
    render(
      <IntentButton
        state={failed(
          {
            kind: "unreachable",
            retryable: true,
            summary: "Server unreachable",
            cause: null,
          },
          retry
        )}
        onPress={vi.fn()}
        idleLabel="Save"
        workingLabel="Saving..."
      />
    )

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Server unreachable")

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("failed, not retryable, resubmission not blocked: no retry control, but the original action still works", () => {
    const onPress = vi.fn()
    render(
      <IntentButton
        state={failed(
          {
            kind: "unavailable",
            retryable: false,
            summary: "This feature isn't available on this deployment.",
            cause: null,
          },
          vi.fn()
        )}
        onPress={onPress}
        idleLabel="Enable"
        workingLabel="Enabling..."
      />
    )

    expect(screen.getByRole("alert").textContent).toContain(
      "This feature isn't available on this deployment."
    )
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
    const button = screen.getByRole("button", { name: "Enable" })
    // This deployment lacking the feature never blocks resubmission - the
    // request definitely never took effect, so trying again (harmless,
    // if futile) is safe. Only `blocksResubmission: true` disables outright
    // - see the next test and this file's own header.
    expect(button.hasAttribute("disabled")).toBe(false)
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("failed, not retryable, resubmission blocked: no retry control, and the original action is disabled rather than resubmittable", () => {
    const onPress = vi.fn()
    render(
      <IntentButton
        state={failed(
          {
            kind: "unreachable",
            retryable: false,
            blocksResubmission: true,
            summary:
              "The study server didn't respond in time. It may have completed the request anyway - check before trying again.",
            cause: null,
          },
          vi.fn()
        )}
        onPress={onPress}
        idleLabel="Save & Play"
        workingLabel="Saving..."
      />
    )

    expect(screen.getByRole("alert").textContent).toContain(
      "It may have completed the request anyway"
    )
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
    const button = screen.getByRole("button", { name: "Save & Play" })
    // Disabled outright, not a fallback to onPress: the previous attempt's
    // outcome is genuinely unknown here, so even a *new* attempt risks
    // duplicating a write that may have already gone through - see this
    // file's own header on the bot-review finding that caught the earlier
    // fall-back-to-onPress behavior, and the finding after that which
    // caught disabling this unconditionally for every non-retryable error.
    expect(button.hasAttribute("disabled")).toBe(true)
    fireEvent.click(button)
    expect(onPress).not.toHaveBeenCalled()
  })

  it("composes an external disabled condition (e.g. a form's isDirty gate) with the intent's own state", () => {
    render(
      <IntentButton
        state={idle()}
        onPress={vi.fn()}
        idleLabel="Save"
        workingLabel="Saving..."
        disabled
      />
    )

    expect(
      screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")
    ).toBe(true)
  })
})
