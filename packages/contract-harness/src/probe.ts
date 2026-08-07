/**
 * @module probe
 *
 * Executes one contract against a running server and turns the result into
 * findings.
 *
 * Everything here goes through plain `fetch` from Node rather than a browser.
 * That is a deliberate choice, not a convenience: several route groups pin CORS
 * to a single origin (`routes/db/tab.rs` and `routes/db/hopium.rs` allow only
 * `http://nixos.local:6006`), so a browser-origin runner would be blocked from
 * most of the surface and would be reporting on the CORS policy as much as on
 * the handshake. A server-to-server request sees the payload the server
 * actually produces.
 */

import type { ConformanceResult } from "./conformance"
import { checkConformance } from "./conformance"
import type { Contract } from "./contract"
import {
  acceptedStatuses,
  bindPath,
  fullPath,
  requestUrl,
  schemaStatuses,
} from "./contract"

export type Severity = "fail" | "warn" | "info"

export type Finding = {
  code: string
  severity: Severity
  message: string
  detail?: string
}

export type OutcomeStatus =
  | "passed"
  | "failed"
  | "warned"
  | "skipped"
  | "errored"

export type ContractOutcome = {
  id: string
  module: string
  summary: string
  method: string
  /** Path actually requested, placeholders resolved. */
  path: string
  status: OutcomeStatus
  httpStatus?: number
  durationMs?: number
  findings: Array<Finding>
  conformance?: ConformanceResult
}

export type ProbeOptions = {
  baseUrl: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

function rollUp(findings: ReadonlyArray<Finding>): OutcomeStatus {
  if (findings.some((finding) => finding.severity === "fail")) return "failed"
  if (findings.some((finding) => finding.severity === "warn")) return "warned"
  return "passed"
}

/** Truncates a response body for reporting without hiding that it was cut. */
function preview(text: string, limit = 300): string {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}… (+${text.length - limit} bytes)`
}

export async function probeContract(
  contract: Contract,
  options: ProbeOptions
): Promise<ContractOutcome> {
  const template = fullPath(contract)
  const base: Omit<ContractOutcome, "status" | "findings"> = {
    id: contract.id,
    module: contract.module,
    summary: contract.summary,
    method: contract.method,
    path: template,
  }

  if (contract.skip !== undefined) {
    return {
      ...base,
      status: "skipped",
      findings: [{ code: "skipped", severity: "info", message: contract.skip }],
    }
  }

  const binding = bindPath(template, contract.request?.path)
  const findings: Array<Finding> = []

  if (binding.unbound.length > 0) {
    // Not sent. A request carrying a literal `:id` returns a 404 that reads
    // like a missing route, which would send whoever debugs it to the wrong
    // side of the boundary entirely.
    return {
      ...base,
      status: "failed",
      findings: [
        {
          code: "unbound-path-param",
          severity: "fail",
          message: `contract declares ${binding.unbound.length} unbound path parameter(s); request not sent`,
          detail: `unbound: ${binding.unbound.join(", ")}`,
        },
      ],
    }
  }

  if (binding.unused.length > 0) {
    findings.push({
      code: "unused-path-param",
      severity: "warn",
      message: "request supplies path parameters the template has no place for",
      detail: `unused: ${binding.unused.join(", ")}`,
    })
  }

  const url = requestUrl(options.baseUrl, binding.path, contract.request?.query)
  const hasBody = contract.request?.body !== undefined

  const startedAt = performance.now()
  let response: Response
  try {
    response = await fetch(url, {
      method: contract.method,
      headers: {
        accept: "application/json",
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...contract.request?.headers,
      },
      body: hasBody ? JSON.stringify(contract.request?.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch (error) {
    return {
      ...base,
      path: binding.path,
      status: "errored",
      durationMs: Math.round(performance.now() - startedAt),
      findings: [
        {
          code: "transport-error",
          severity: "fail",
          message: "request did not complete",
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }

  const durationMs = Math.round(performance.now() - startedAt)
  const bodyText = await response.text()
  const accepted = acceptedStatuses(contract)

  if (!accepted.includes(response.status)) {
    findings.push({
      code: "status-mismatch",
      severity: "fail",
      message: `expected ${accepted.join(" or ")}, got ${response.status}`,
      detail: preview(bodyText),
    })
  }

  let conformance: ConformanceResult | undefined
  const schemaApplies = schemaStatuses(contract).includes(response.status)

  if (contract.expect.schema !== undefined && schemaApplies) {
    let parsedBody: unknown
    try {
      parsedBody = bodyText === "" ? undefined : JSON.parse(bodyText)
    } catch {
      findings.push({
        code: "non-json-body",
        severity: "fail",
        message: "contract declares a schema but the body is not JSON",
        detail: preview(bodyText),
      })
      return {
        ...base,
        path: binding.path,
        status: "failed",
        httpStatus: response.status,
        durationMs,
        findings,
      }
    }

    conformance = checkConformance(contract.expect.schema, parsedBody)

    if (!conformance.valid) {
      findings.push({
        code: "schema-violation",
        severity: "fail",
        message: `response does not match the declared schema (${conformance.issues.length} issue(s))`,
        detail: conformance.issues.join("\n"),
      })
    }

    const policy = contract.expect.unknownFields ?? "report"
    if (policy !== "ignore" && conformance.unknownFields.length > 0) {
      findings.push({
        code: "unknown-field",
        severity: policy === "reject" ? "fail" : "warn",
        message: `server sent ${conformance.unknownFields.length} field(s) the contract does not declare`,
        detail: conformance.unknownFields
          .map((field) => `${field.path} (in ${field.samples} sample(s))`)
          .join("\n"),
      })
    }

    if (conformance.phantomFields.length > 0) {
      findings.push({
        code: "phantom-field",
        severity: "warn",
        message: `contract declares ${conformance.phantomFields.length} optional field(s) the server never sent`,
        detail: conformance.phantomFields
          .map(
            (field) =>
              `${field.path} (absent from all ${field.samples} sample(s))`
          )
          .join("\n"),
      })
    }

    if (conformance.sampleCount === 0) {
      findings.push({
        code: "no-samples",
        severity: "info",
        message:
          "response carried no values, so field-level checks proved nothing — seed data and re-run",
      })
    }

    if (conformance.opaqueSubtrees.length > 0) {
      findings.push({
        code: "opaque-subtree",
        severity: "info",
        message:
          "some subtrees have no single declared shape and were not audited for unknown fields",
        detail: conformance.opaqueSubtrees.join(", "),
      })
    }
  }

  if (
    contract.expect.schema !== undefined &&
    !schemaApplies &&
    accepted.includes(response.status)
  ) {
    // Surfaced rather than passed over silently: a contract that only ever sees
    // its non-schema status is green while checking nothing about the payload.
    findings.push({
      code: "schema-not-applicable",
      severity: "info",
      message: `server answered ${response.status}; the declared schema covers ${schemaStatuses(contract).join(", ")}, so the body was not checked`,
    })
  }

  return {
    ...base,
    path: binding.path,
    status: rollUp(findings),
    httpStatus: response.status,
    durationMs,
    findings,
    conformance,
  }
}
