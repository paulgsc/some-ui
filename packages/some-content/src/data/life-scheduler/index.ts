export type TaskStatus = "ok" | "warn" | "err"

export type Task = {
  name: string
  status: TaskStatus
  interval: string
  lastRun: string
}

export type NodeData = {
  label: string
  bucket: string
  slot: string
  load: number
  tasks: Array<Task>
  description: string
}

const TASK_POOL: Array<{ name: string; desc: string }> = [
  { name: "sync-db", desc: "Replicate shard delta to primaries" },
  { name: "cache-flush", desc: "Invalidate L2 cache segments" },
  { name: "report-gen", desc: "Aggregate metrics into report store" },
  { name: "healthcheck", desc: "Probe all upstream dependencies" },
  { name: "index-rebuild", desc: "Rebuild inverted index for search" },
  { name: "metrics-push", desc: "Emit counters to Prometheus endpoint" },
  { name: "backup", desc: "Snapshot volume to cold storage" },
  { name: "notify", desc: "Dispatch pending alert queue" },
  { name: "cleanup", desc: "Prune stale sessions and temp files" },
  { name: "rebalance", desc: "Redistribute partition leaders" },
  { name: "auth-refresh", desc: "Rotate JWT signing keys" },
  { name: "log-rotate", desc: "Compress and archive log segments" },
  { name: "gc-collect", desc: "Force minor GC on aged heaps" },
  { name: "schema-drift", desc: "Detect and report schema divergence" },
  { name: "rate-reset", desc: "Reset per-tenant rate limit buckets" },
]

const STATUSES: Array<TaskStatus> = [
  "ok",
  "ok",
  "ok",
  "ok",
  "warn",
  "ok",
  "ok",
  "err",
  "ok",
  "warn",
]
const INTERVALS = ["5s", "10s", "15s", "30s", "60s", "120s", "300s", "600s"]
const LAST_RUNS = [
  "just now",
  "2s ago",
  "8s ago",
  "15s ago",
  "42s ago",
  "2m ago",
  "5m ago",
]

const OUTER_LABELS = [
  "ingestion",
  "transform",
  "validate",
  "enrich",
  "route",
  "persist",
  "index",
  "notify",
  "archive",
  "analyze",
  "sync",
  "replicate",
  "audit",
  "expire",
  "compact",
  "rebalance",
  "snapshot",
  "restore",
  "emit",
  "consume",
  "aggregate",
  "fan-out",
  "merge",
  "finalize",
]

const OUTER_DESCS = [
  "Raw event ingestion from producers",
  "Schema transformation pipeline",
  "Constraint & rule validation",
  "Data enrichment from reference sets",
  "Content-based routing logic",
  "Durable persistence layer",
  "Search index maintenance",
  "Downstream notification dispatch",
  "Cold storage archival",
  "Analytics aggregation",
  "Cross-region sync",
  "Log replication",
  "Compliance audit trail",
  "TTL expiry sweep",
  "Compaction of fragmented segments",
  "Partition rebalancing",
  "Point-in-time snapshot",
  "Volume restore ops",
  "Metric emission",
  "Event consumption",
  "Windowed aggregation",
  "Fan-out to consumers",
  "Stream merge",
  "Finalization & commit",
]

function hash(a: number, b: number): number {
  let h = (a * 2654435761 + b * 2246822519) >>> 0
  return h
}

export function getNodeData(
  type: "outer" | "inner",
  outer: number,
  inner: number
): NodeData {
  const seed = type === "outer" ? hash(outer, 0) : hash(outer, inner + 1)
  const taskCount = 2 + (seed % 4)
  const tasks: Array<Task> = []
  for (let i = 0; i < taskCount; i++) {
    const ti = hash(seed, i * 7) % TASK_POOL.length
    const si = hash(seed, i * 13) % STATUSES.length
    const ii = hash(seed, i * 17) % INTERVALS.length
    const li = hash(seed, i * 23) % LAST_RUNS.length
    tasks.push({
      name: TASK_POOL[ti]!.name,
      status: STATUSES[si]!,
      interval: INTERVALS[ii]!,
      lastRun: LAST_RUNS[li]!,
    })
  }
  const load = 15 + (hash(seed, 999) % 75)
  if (type === "outer") {
    return {
      label: OUTER_LABELS[outer % OUTER_LABELS.length]!,
      bucket: `b24·${String(outer).padStart(2, "0")}`,
      slot: `${outer} / 24`,
      load,
      tasks,
      description: OUTER_DESCS[outer % OUTER_DESCS.length]!,
    }
  }
  return {
    label: `slot·${String(inner).padStart(2, "0")}`,
    bucket: `b60·${String(inner).padStart(2, "0")} @ outer·${String(outer).padStart(2, "0")}`,
    slot: `${inner} / 60  (outer ${outer})`,
    load,
    tasks,
    description: `Fine-grained execution slot ${inner} within outer bucket ${outer} (${OUTER_LABELS[outer % OUTER_LABELS.length]!})`,
  }
}
