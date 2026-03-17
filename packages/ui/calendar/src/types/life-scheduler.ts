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
