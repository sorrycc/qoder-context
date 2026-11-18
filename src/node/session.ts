import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { FleetAgent, SessionDetail, SessionResponse } from "../shared/types.js"
import { agentStatus, DETAIL_LIMITS } from "./fold.js"
import { FoldCache } from "./folds.js"
import type { HostUsageReader } from "./host-usage.js"
import { describe, isSessionId, mapLimit, subagentDir, type TranscriptLocator } from "./transcripts.js"

const CACHE_SIZE = 4
const RESULT_LIMIT = 160
/** A subagent that wrote this recently and hasn't reported back counts as still running. */
const RUNNING_MS = 2 * 60_000

/**
 * Serves per-session detail. A caller that passes the `version` it already holds gets
 * `unchanged` without a re-fold while the transcript (and its subagents) stay untouched; recent
 * responses are kept so several open views share one parse, and a grown transcript only reads what
 * was appended (see FoldCache).
 */
export class SessionDetails {
  private readonly recent = new Map<string, Extract<SessionResponse, { status: "ok" }>>()

  constructor(
    private readonly locator: TranscriptLocator,
    private readonly folds = new FoldCache(),
    private readonly host: HostUsageReader | null = null,
  ) {}

  async load(sessionId: unknown, known?: unknown): Promise<SessionResponse> {
    if (!isSessionId(sessionId)) return { status: "unbound" }
    const file = await this.locator.find(sessionId)
    const transcript = file ? await describe(file, sessionId) : null
    if (!transcript) return { status: "missing" }
    const { version } = transcript
    if (known === version) return { status: "unchanged", version }
    const cached = this.recent.get(sessionId)
    if (cached?.version === version) return cached
    const folded = await this.folds.use(transcript, (fold) => fold.detail())
    const [host, agents] = await Promise.all([this.host?.read(sessionId) ?? null, withTasks(folded.agents, transcript.file)])
    const detail: SessionDetail = { ...folded, host, agents }
    const response = { status: "ok", version, detail } as const
    this.recent.delete(sessionId)
    this.recent.set(sessionId, response)
    if (this.recent.size > CACHE_SIZE) this.recent.delete(this.recent.keys().next().value!)
    return response
  }
}

interface TaskRecord {
  readonly status: string | null
  readonly model: string | null
  readonly result: string | null
}

/**
 * Fills each subagent's status, model and report from its `task-*.json` beside the transcripts,
 * which qodercli rewrites as the task moves; agents without one keep what their launching call said.
 */
export async function withTasks(agents: readonly FleetAgent[], transcript: string, now = Date.now()): Promise<FleetAgent[]> {
  if (agents.length === 0) return []
  const dir = subagentDir(transcript)
  const names = (await readdir(dir).catch(() => [] as string[])).filter((name) => name.startsWith("task-") && name.endsWith(".json"))
  const tasks = new Map<string, TaskRecord>()
  await mapLimit(names.slice(0, DETAIL_LIMITS.agents * 2), 8, async (name) => {
    try {
      const parsed = JSON.parse(await readFile(join(dir, name), "utf8")) as Record<string, unknown>
      if (typeof parsed.agentId !== "string") return
      tasks.set(parsed.agentId, {
        status: typeof parsed.status === "string" ? parsed.status : null,
        model: typeof parsed.resolvedModel === "string" && parsed.resolvedModel ? parsed.resolvedModel : null,
        result: typeof parsed.result === "string" && parsed.result.trim() ? excerpt(parsed.result) : null,
      })
    } catch {
      // A task file caught mid-write is read again on the next change.
    }
  })
  return agents.map((agent) => {
    const task = tasks.get(agent.id)
    const status = task?.status ? agentStatus(task.status) : agent.status
    return {
      ...agent,
      model: agent.model ?? task?.model ?? null,
      result: agent.result ?? task?.result ?? null,
      status: status === "unknown" && agent.lastAt > 0 && now - agent.lastAt < RUNNING_MS ? "running" : status,
    }
  })
}

function excerpt(text: string): string {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > RESULT_LIMIT ? `${line.slice(0, RESULT_LIMIT - 1).trimEnd()}…` : line
}
