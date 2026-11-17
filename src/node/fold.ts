import { localDay } from "../shared/days.js"
import type {
  ContextEvent,
  DayBucket,
  FileActivity,
  RequestPoint,
  SessionDetail,
  SessionSummary,
  Tally,
} from "../shared/types.js"

export const DETAIL_LIMITS = { requests: 800, events: 300, files: 60, tallies: 30 } as const
const FILE_TRACK_LIMIT = 2_000
const EVENT_TEXT_LIMIT = 240

const READ_TOOLS = new Set(["Read", "NotebookRead"])
const WRITE_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"])
const SHELL_TOOLS = new Set(["Bash", "Monitor"])
const COMMAND_WRAPPERS = new Set(["sudo", "env", "time", "exec", "nohup", "command", "xargs", "do", "then", "else", "elif", "if", "while", "until"])
const SHELL_KEYWORDS = new Set(["cd", "for", "while", "until", "if", "then", "do", "done", "else", "elif", "fi", "case", "esac", "function", "in", "select", "return", "export", "local", "set", "true", "false"])
const SKILL_ACTIVATED = /^Skill \*\*(.+?)\*\* activated/

type Json = Record<string, unknown>

interface MutableRequest {
  at: number
  turn: number
  prompt: number
  cacheRead: number
  output: number
  model: string | null
  tools: string[]
}

class TallyMap {
  private readonly entries = new Map<string, { count: number; lastAt: number }>()

  add(name: string, at: number): void {
    const entry = this.entries.get(name)
    if (entry) {
      entry.count += 1
      entry.lastAt = Math.max(entry.lastAt, at)
    } else {
      this.entries.set(name, { count: 1, lastAt: at })
    }
  }

  top(limit: number): Tally[] {
    return [...this.entries]
      .map(([name, entry]) => ({ name, count: entry.count, lastAt: entry.lastAt }))
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, limit)
  }
}

/**
 * Folds qodercli JSONL transcript entries into session facts. Unknown or malformed
 * entries are ignored so a new transcript shape never breaks the whole session.
 */
export class SessionFold {
  private title: string | null = null
  private customTitle: string | null = null
  private cwd: string | null = null
  private gitBranch: string | null = null
  private model: string | null = null
  private firstAt = Number.POSITIVE_INFINITY
  private lastAt = 0
  private turns = 0
  private requestCount = 0
  private prompt = 0
  private cacheRead = 0
  private cacheCreate = 0
  private output = 0
  private contextTokens = 0
  private configuredWindow: number | null = null
  private derivedWindow: number | null = null
  private compactions = 0
  private toolRuns = 0
  private toolErrors = 0
  private subagents = 0
  private readonly seenMessages = new Set<string>()
  private readonly seenToolUses = new Map<string, string>()
  private readonly pendingTools = new Map<string, string[]>()
  private readonly days = new Map<string, { tokens: number; requests: number; turns: number; toolRuns: number }>()
  private readonly tools = new TallyMap()
  private readonly skills = new TallyMap()
  private readonly commands = new TallyMap()
  private readonly files = new Map<string, { reads: number; writes: number; lastAt: number }>()
  private readonly requests: MutableRequest[] = []
  private events: ContextEvent[] = []

  constructor(private readonly id: string) {}

  /** Marks the start of a subagent transcript; its entries count toward totals only. */
  beginSubagent(): void {
    this.subagents += 1
  }

  add(raw: unknown, sidechain = false): void {
    if (!isRecord(raw) || typeof raw.type !== "string") return
    const at = readTime(raw.timestamp)
    const main = !sidechain && raw.isSidechain !== true
    if (at !== null && main) {
      this.firstAt = Math.min(this.firstAt, at)
      this.lastAt = Math.max(this.lastAt, at)
    }
    if (main) {
      if (typeof raw.cwd === "string" && raw.cwd) this.cwd = raw.cwd
      if (typeof raw.gitBranch === "string" && raw.gitBranch) this.gitBranch = raw.gitBranch
    }
    switch (raw.type) {
      case "ai-title":
        if (main && typeof raw.aiTitle === "string" && raw.aiTitle.trim()) this.title = raw.aiTitle.trim()
        return
      case "custom-title":
        if (main && typeof raw.customTitle === "string" && raw.customTitle.trim()) this.customTitle = raw.customTitle.trim()
        return
      case "runtime-config":
        if (!main) return
        if (typeof raw.contextWindow === "number" && raw.contextWindow > 0) this.configuredWindow = raw.contextWindow
        if (typeof raw.model === "string" && raw.model && raw.model !== "auto") this.model = raw.model
        return
      case "user":
        this.addUser(raw, at, main)
        return
      case "assistant":
        this.addAssistant(raw, at ?? this.lastAt, main)
        return
      case "system":
        this.addSystem(raw, at ?? this.lastAt, main)
        return
      default:
        return
    }
  }

  summary(): SessionSummary {
    const firstAt = Number.isFinite(this.firstAt) ? this.firstAt : this.lastAt
    return {
      id: this.id,
      title: this.customTitle ?? this.title,
      cwd: this.cwd,
      gitBranch: this.gitBranch,
      model: this.model,
      firstAt,
      lastAt: this.lastAt,
      turns: this.turns,
      requests: this.requestCount,
      tokens: { prompt: this.prompt, cacheRead: this.cacheRead, cacheCreate: this.cacheCreate, output: this.output },
      contextTokens: this.contextTokens,
      contextWindow: this.configuredWindow ?? this.derivedWindow,
      compactions: this.compactions,
      toolRuns: this.toolRuns,
      toolErrors: this.toolErrors,
      subagents: this.subagents,
      days: [...this.days]
        .map(([day, bucket]): DayBucket => ({ day, ...bucket }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      tools: this.tools.top(DETAIL_LIMITS.tallies),
      skills: this.skills.top(DETAIL_LIMITS.tallies),
      commands: this.commands.top(DETAIL_LIMITS.tallies),
    }
  }

  detail(): SessionDetail {
    const truncated = Math.max(0, this.requests.length - DETAIL_LIMITS.requests)
    const files: FileActivity[] = [...this.files]
      .map(([path, entry]) => ({ path, ...entry }))
      .sort((a, b) => b.reads + b.writes - (a.reads + a.writes) || b.lastAt - a.lastAt)
      .slice(0, DETAIL_LIMITS.files)
    return {
      summary: this.summary(),
      requests: this.requests.slice(truncated).map((request): RequestPoint => ({ ...request, tools: [...request.tools] })),
      requestsTruncated: truncated,
      events: this.events.slice(-DETAIL_LIMITS.events),
      files,
    }
  }

  private bucket(at: number) {
    const day = localDay(at)
    let bucket = this.days.get(day)
    if (!bucket) {
      bucket = { tokens: 0, requests: 0, turns: 0, toolRuns: 0 }
      this.days.set(day, bucket)
    }
    return bucket
  }

  private addUser(raw: Json, at: number | null, main: boolean): void {
    // Slash-command turns carry humanInput on an isMeta entry, so humanInput alone marks a turn.
    if (main && raw.humanInput != null) {
      this.turns += 1
      if (at !== null) this.bucket(at).turns += 1
    }
    const message = isRecord(raw.message) ? raw.message : null
    if (!message || !Array.isArray(message.content)) return
    for (const block of message.content) {
      if (!isRecord(block) || block.type !== "tool_result" || block.is_error !== true) continue
      if (typeof block.tool_use_id === "string" && this.seenToolUses.has(block.tool_use_id)) this.toolErrors += 1
    }
  }

  private addAssistant(raw: Json, at: number, main: boolean): void {
    const message = isRecord(raw.message) ? raw.message : null
    if (!message) return
    const messageId = typeof message.id === "string" ? message.id : null
    let pending = messageId ? this.pendingTools.get(messageId) : undefined
    if (!pending) {
      pending = []
      if (messageId) this.pendingTools.set(messageId, pending)
    }
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (isRecord(block) && block.type === "tool_use") this.addToolUse(block, at, main, pending)
      }
    }
    const usage = isRecord(message.usage) ? message.usage : null
    if (!usage || (messageId && this.seenMessages.has(messageId))) return
    if (messageId) this.seenMessages.add(messageId)
    const input = readCount(usage.input_tokens)
    const cacheRead = readCount(usage.cache_read_input_tokens)
    const cacheCreate = readCount(usage.cache_creation_input_tokens)
    const output = readCount(usage.output_tokens)
    // Qoder reports input_tokens inclusive of cached tokens; Anthropic-style BYOK reports
    // them separately, which shows up as cache reads larger than the input count.
    const prompt = cacheRead > input ? input + cacheRead + cacheCreate : input
    this.requestCount += 1
    this.prompt += prompt
    this.cacheRead += cacheRead
    this.cacheCreate += cacheCreate
    this.output += output
    const bucket = this.bucket(at)
    bucket.tokens += prompt + output
    bucket.requests += 1
    const model = typeof message.model === "string" && message.model ? message.model : null
    if (!main) return
    if (model && model !== "auto") this.model = model
    this.contextTokens = prompt
    const ratio = typeof usage.context_usage_ratio === "number" ? usage.context_usage_ratio : 0
    if (ratio > 0 && input > 0) this.derivedWindow = Math.round(input / ratio)
    this.requests.push({ at, turn: this.turns, prompt, cacheRead, output, model, tools: pending })
  }

  private addToolUse(block: Json, at: number, main: boolean, pending: string[]): void {
    const name = typeof block.name === "string" ? block.name : null
    if (!name) return
    const id = typeof block.id === "string" ? block.id : null
    if (id) {
      if (this.seenToolUses.has(id)) return
      this.seenToolUses.set(id, name)
    }
    this.toolRuns += 1
    this.bucket(at).toolRuns += 1
    this.tools.add(name, at)
    if (main) pending.push(name)
    const input = isRecord(block.input) ? block.input : {}
    if (name === "Skill" && typeof input.skill === "string") this.skills.add(input.skill, at)
    if (SHELL_TOOLS.has(name) && typeof input.command === "string") {
      for (const program of commandPrograms(input.command)) this.commands.add(program, at)
    }
    const path =
      typeof input.file_path === "string" ? input.file_path : typeof input.notebook_path === "string" ? input.notebook_path : null
    if (path && (READ_TOOLS.has(name) || WRITE_TOOLS.has(name))) this.addFile(path, WRITE_TOOLS.has(name), at)
  }

  private addFile(path: string, write: boolean, at: number): void {
    let entry = this.files.get(path)
    if (!entry) {
      if (this.files.size >= FILE_TRACK_LIMIT) return
      entry = { reads: 0, writes: 0, lastAt: at }
      this.files.set(path, entry)
    }
    if (write) entry.writes += 1
    else entry.reads += 1
    entry.lastAt = Math.max(entry.lastAt, at)
  }

  private addSystem(raw: Json, at: number, main: boolean): void {
    const content = typeof raw.content === "string" ? raw.content : ""
    if (raw.subtype === "informational") {
      const skill = SKILL_ACTIVATED.exec(content)?.[1]
      if (skill) this.skills.add(skill, at)
      return
    }
    if (!main) return
    const requestIndex = this.requests.length
    if (raw.subtype === "compact_boundary") {
      this.compactions += 1
      const metadata = isRecord(raw.compactMetadata) ? raw.compactMetadata : {}
      const trigger = metadata.trigger === "manual" || metadata.trigger === "auto" ? metadata.trigger : "unknown"
      this.pushEvent({
        kind: "compaction",
        at,
        trigger,
        preTokens: readNullableCount(metadata.preTokens),
        postTokens: readNullableCount(metadata.postTokens),
        durationMs: readNullableCount(metadata.durationMs),
        requestIndex,
      })
      const postTokens = readNullableCount(metadata.postTokens)
      if (postTokens !== null) this.contextTokens = postTokens
      return
    }
    if (raw.subtype === "api_retry" || raw.subtype === "api_error" || raw.subtype === "error") {
      this.pushEvent({
        kind: raw.subtype === "api_retry" ? "retry" : "error",
        at,
        text: content.slice(0, EVENT_TEXT_LIMIT),
        requestIndex,
      })
    }
  }

  private pushEvent(event: ContextEvent): void {
    this.events.push(event)
    if (this.events.length > DETAIL_LIMITS.events * 2) this.events = this.events.slice(-DETAIL_LIMITS.events)
  }
}

/** Distinct program names a shell command line runs, e.g. `cd x && npm test | tee` → npm, tee. */
export function commandPrograms(command: string): string[] {
  const programs = new Set<string>()
  for (const segment of stripLiterals(command).split(/&&|\|\||[;|\n]/)) {
    const tokens = segment
      .trim()
      .replace(/^[({\s!]+/, "")
      .split(/\s+/)
      .filter((token) => token && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token))
    const names = tokens.map((token) => token.replace(/^["']|["')]$/g, "").split("/").pop() ?? "")
    let index = 0
    while (index < names.length - 1 && COMMAND_WRAPPERS.has(names[index] ?? "")) index += 1
    const program = names[index]
    if (!program) continue
    if (/^[A-Za-z0-9][\w.+-]*$/.test(program) && !SHELL_KEYWORDS.has(program)) programs.add(program)
  }
  return [...programs]
}

/** Drops heredoc bodies and quoted strings so script text inside them isn't read as commands. */
function stripLiterals(command: string): string {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "$3")
    .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''")
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function readNullableCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}
