import { isAbsolute, join } from "node:path"
import { localDay } from "../shared/days.js"
import type {
  AgentStatus,
  CommandRun,
  CommandStatus,
  ContextEstimate,
  ContextEvent,
  DayBucket,
  DayTallies,
  FileActivity,
  FleetAgent,
  InjectItem,
  ModelUsage,
  RequestCause,
  RequestPoint,
  SessionDetail,
  SessionSummary,
  Tally,
  TimingStats,
} from "../shared/types.js"

export const DETAIL_LIMITS = { requests: 800, events: 300, files: 80, tallies: 30, dayTallies: 24, commands: 300, agents: 200 } as const
const FILE_TRACK_LIMIT = 2_000
const EVENT_TEXT_LIMIT = 240
const COMMAND_TEXT_LIMIT = 240
const REPLY_LIMIT = 160
const PROMPT_LIMIT = 200
const LABEL_LIMIT = 120
/** Files taken from one search result; a broad Glob can list thousands. */
const SEARCH_FILE_LIMIT = 50
/** Rough token cost of an image block. */
const IMAGE_TOKENS = 1_600
/** Slices in the timing ribbon. */
export const RIBBON_SLICES = 96
/** A wait longer than this is taken as the machine sleeping or the user away, not work. */
const SPAN_CAP_MS = 60 * 60_000

const READ_TOOLS = new Set(["Read", "NotebookRead"])
const WRITE_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"])
const SHELL_TOOLS = new Set(["Bash", "Monitor"])
const SEARCH_TOOLS = new Set(["Grep", "Glob"])
const AGENT_TOOLS = new Set(["Agent", "Task"])
const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|bmp|heic|tiff?)$/i
const COMMAND_WRAPPERS = new Set(["sudo", "env", "time", "exec", "nohup", "command", "xargs", "do", "then", "else", "elif", "if", "while", "until"])
const SHELL_KEYWORDS = new Set(["cd", "for", "while", "until", "if", "then", "do", "done", "else", "elif", "fi", "case", "esac", "function", "in", "select", "return", "export", "local", "set", "true", "false"])
const SKILL_ACTIVATED = /^Skill \*\*(.+?)\*\* activated/
/** Attachment fields that name or locate something rather than carry text the model reads. */
const METADATA_KEYS = new Set([
  "type",
  "filename",
  "filePath",
  "displayPath",
  "path",
  "planFilePath",
  "hookName",
  "hookEvent",
  "hookEventName",
  "toolUseID",
  "command",
  "mtime",
  "names",
  "addedNames",
  "removedNames",
  "addedTypes",
  "removedTypes",
  "serverNames",
])

/** Attachments shown as context events, by attachment type. */
const INJECT_ITEMS: Readonly<Record<string, InjectItem>> = {
  skill_listing: "skillList",
  invoked_skills: "skill",
  relevant_memories: "memory",
  hook_output: "hook",
  hook_system_message: "hook",
  mcp_instructions_delta: "mcpInstructions",
  mcp_lazy_tools_delta: "mcpTools",
  file: "file",
  post_compact_restored_files: "restoredFiles",
  agent_listing_delta: "agentList",
}

type Json = Record<string, unknown>
type TallyKind = "tools" | "skills" | "commands"

interface MutableRequest {
  at: number
  turn: number
  prompt: number
  cacheRead: number
  output: number
  model: string | null
  tools: string[]
  latencyMs: number | null
  credits: number | null
  cause: RequestCause
  reply: string | null
}

/** What one model response has shown so far; its entries arrive one content block at a time. */
interface PendingMessage {
  readonly tools: string[]
  reply: string | null
  request: MutableRequest | null
}

/** A subagent's `.meta.json`, as far as it is read. */
export interface AgentMeta {
  readonly agentType?: string
  readonly description?: string
  readonly toolUseId?: string
}

interface AgentStats {
  requests: number
  tokens: number
  credits: number
  toolRuns: number
  contextTokens: number
  model: string | null
  firstAt: number
  lastAt: number
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }
type SpanKind = "model" | "tool" | "compact"

interface Span {
  readonly kind: SpanKind
  readonly start: number
  end: number
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
  private credits = 0
  private originalCredits = 0
  private metered = 0
  private contextTokens = 0
  private configuredWindow: number | null = null
  private derivedWindow: number | null = null
  private compactions = 0
  private toolRuns = 0
  private toolErrors = 0
  private subagents = 0
  /** The subagent whose transcript is being read, or null for the main one. */
  private agent: string | null = null
  /** Message id → index of its request in `requests`, or -1 for a subagent's. */
  private readonly seenMessages = new Map<string, number>()
  private readonly seenToolUses = new Map<string, string>()
  private readonly pending = new Map<string, PendingMessage>()
  private readonly days = new Map<string, Omit<Mutable<DayBucket>, "day" | "activeMs">>()
  private readonly tallies: Record<TallyKind, TallyMap> = { tools: new TallyMap(), skills: new TallyMap(), commands: new TallyMap() }
  private readonly dayTallies = new Map<string, Record<TallyKind, TallyMap>>()
  private readonly files = new Map<string, Omit<Mutable<FileActivity>, "path">>()
  private readonly requests: MutableRequest[] = []
  private events: ContextEvent[] = []
  private runs: Mutable<CommandRun>[] = []
  private runsDropped = 0
  private readonly openRuns = new Map<string, Mutable<CommandRun>>()
  private readonly spans: Span[] = []
  /** When the main agent last started waiting on the model (a prompt, tool result or compaction). */
  private waitingSince: number | null = null
  private openToolSpan: Span | null = null
  private timedOutput = 0
  /** What the main agent's next request follows. */
  private cause: RequestCause = "prompt"
  private readonly prompts = new Map<number, string>()
  private estimate: Mutable<ContextEstimate> = emptyEstimate()
  private runtime: { model: string; effort: string | null } | null = null
  private readonly modes: Record<"plan" | "auto", boolean> = { plan: false, auto: false }
  private readonly models = new Map<string, Mutable<Omit<ModelUsage, "model">>>()
  private readonly agents = new Map<string, AgentStats>()
  private readonly agentMeta = new Map<string, AgentMeta>()
  /** Agent-launching tool use id → the agent that issued it (null for the main one). */
  private readonly launches = new Map<string, string | null>()
  /** Subagent id → how its launching call reported back. */
  private readonly outcomes = new Map<string, { readonly toolUseId: string | null; readonly state: string | null; readonly result: string | null }>()

  constructor(private readonly id: string) {}

  /**
   * Marks the start of a subagent transcript; its entries count toward totals only. `meta` is what
   * its `.meta.json` says: its type, its task and the tool call that launched it.
   */
  beginSubagent(agentId: string | null = null, meta: AgentMeta = {}): void {
    this.subagents += 1
    this.agent = agentId
    if (agentId) this.agentMeta.set(agentId, meta)
  }

  /** Continues a subagent transcript started earlier, e.g. with the entries appended since. */
  resumeSubagent(agentId: string): void {
    this.agent = agentId
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
    } else if (at !== null) {
      const stats = this.agentStats()
      if (stats) {
        stats.firstAt = Math.min(stats.firstAt, at)
        stats.lastAt = Math.max(stats.lastAt, at)
      }
    }
    switch (raw.type) {
      case "ai-title":
        if (main && typeof raw.aiTitle === "string" && raw.aiTitle.trim()) this.title = raw.aiTitle.trim()
        return
      case "custom-title":
        if (main && typeof raw.customTitle === "string" && raw.customTitle.trim()) this.customTitle = raw.customTitle.trim()
        return
      case "runtime-config":
        if (main) this.addRuntime(raw, at ?? this.lastAt)
        return
      case "user":
        this.addUser(raw, at, main)
        return
      case "assistant":
        this.addAssistant(raw, at, main)
        return
      case "attachment":
        if (main) this.addAttachment(raw, at ?? this.lastAt)
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
      credits: roundCredits(this.credits),
      originalCredits: roundCredits(this.originalCredits),
      metered: this.metered,
      contextTokens: this.contextTokens,
      contextWindow: this.configuredWindow ?? this.derivedWindow,
      compactions: this.compactions,
      toolRuns: this.toolRuns,
      toolErrors: this.toolErrors,
      subagents: this.subagents,
      days: this.dayBuckets(),
      tools: this.tallies.tools.top(DETAIL_LIMITS.tallies),
      skills: this.tallies.skills.top(DETAIL_LIMITS.tallies),
      commands: this.tallies.commands.top(DETAIL_LIMITS.tallies),
      dayTallies: [...this.dayTallies]
        .map(([day, maps]): DayTallies => ({
          day,
          tools: maps.tools.top(DETAIL_LIMITS.dayTallies),
          skills: maps.skills.top(DETAIL_LIMITS.dayTallies),
          commands: maps.commands.top(DETAIL_LIMITS.dayTallies),
        }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    }
  }

  detail(): SessionDetail {
    const truncated = Math.max(0, this.requests.length - DETAIL_LIMITS.requests)
    const requests = this.requests.slice(truncated).map((request): RequestPoint => ({ ...request, tools: [...request.tools] }))
    const turns = new Set(requests.map((request) => request.turn))
    const files: FileActivity[] = [...this.files]
      .map(([path, entry]) => ({ path, ...entry }))
      .sort((a, b) => fileWeight(b) - fileWeight(a) || b.lastAt - a.lastAt)
      .slice(0, DETAIL_LIMITS.files)
    return {
      summary: this.summary(),
      requests,
      requestsTruncated: truncated,
      events: this.events.slice(-DETAIL_LIMITS.events),
      files,
      commands: this.commandRuns(),
      commandsTruncated: this.runsDropped + Math.max(0, this.runs.length - DETAIL_LIMITS.commands),
      timing: this.timing(),
      prompts: [...this.prompts].filter(([turn]) => turns.has(turn)).map(([turn, text]) => ({ turn, text })),
      estimate: { ...this.estimate },
      host: null,
      models: [...this.models]
        .map(([model, usage]) => ({ model, ...usage, credits: roundCredits(usage.credits) }))
        .sort((a, b) => b.credits - a.credits || b.tokens - a.tokens),
      agents: this.fleet(),
    }
  }

  private fleet(): FleetAgent[] {
    const ids = new Set([...this.agents.keys(), ...this.outcomes.keys()])
    const agents: FleetAgent[] = []
    for (const id of ids) {
      const stats = this.agents.get(id)
      const outcome = this.outcomes.get(id)
      const meta = this.agentMeta.get(id)
      const toolUseId = meta?.toolUseId ?? outcome?.toolUseId
      const issuer = toolUseId ? this.launches.get(toolUseId) : undefined
      agents.push({
        id,
        parent: issuer ?? null,
        type: meta?.agentType ?? null,
        description: meta?.description ?? null,
        model: stats?.model ?? null,
        status: agentStatus(outcome?.state ?? null),
        requests: stats?.requests ?? 0,
        tokens: stats?.tokens ?? 0,
        credits: roundCredits(stats?.credits ?? 0),
        toolRuns: stats?.toolRuns ?? 0,
        contextTokens: stats?.contextTokens ?? 0,
        firstAt: stats && Number.isFinite(stats.firstAt) ? stats.firstAt : 0,
        lastAt: stats?.lastAt ?? 0,
        result: outcome?.result ?? null,
      })
    }
    return agents.sort((a, b) => a.firstAt - b.firstAt).slice(0, DETAIL_LIMITS.agents)
  }

  private dayBuckets(): DayBucket[] {
    const active = new Map<string, number>()
    for (const span of this.spans) {
      const day = localDay(span.start)
      active.set(day, (active.get(day) ?? 0) + spanLength(span))
    }
    return [...this.days]
      .map(([day, bucket]): DayBucket => ({ day, ...bucket, credits: roundCredits(bucket.credits), activeMs: Math.round(active.get(day) ?? 0) }))
      .sort((a, b) => a.day.localeCompare(b.day))
  }

  private commandRuns(): CommandRun[] {
    const lastRequestAt = this.requests.at(-1)?.at ?? 0
    return this.runs.slice(-DETAIL_LIMITS.commands).map((run) =>
      // A run with no result that a later request moved past was cut off (an interrupt, a crash).
      run.status === "running" && !run.subagent && run.at < lastRequestAt ? { ...run, status: "cancelled" } : { ...run },
    )
  }

  private timing(): TimingStats {
    const totals = { model: 0, tool: 0, compact: 0 }
    for (const span of this.spans) totals[span.kind] += spanLength(span)
    const active = totals.model + totals.tool + totals.compact
    const ribbon = active > 0 ? Array.from({ length: RIBBON_SLICES }, () => ({ model: 0, tool: 0, compact: 0 })) : []
    const slice = active / RIBBON_SLICES
    let offset = 0
    for (const span of this.spans) {
      let left = spanLength(span)
      while (left > 0) {
        // A hair past a boundary counts as the next slice, so rounding never leaves one empty.
        const index = Math.min(RIBBON_SLICES - 1, Math.floor((offset + 1e-6) / slice))
        const take = index === RIBBON_SLICES - 1 ? left : Math.min(left, (index + 1) * slice - offset)
        ribbon[index]![span.kind] += take
        offset += take
        left -= take
      }
    }
    return {
      modelMs: totals.model,
      toolMs: totals.tool,
      compactMs: totals.compact,
      timedOutput: this.timedOutput,
      ribbon: ribbon.map((cell) => ({ model: Math.round(cell.model), tool: Math.round(cell.tool), compact: Math.round(cell.compact) })),
    }
  }

  private bucket(at: number) {
    const day = localDay(at)
    let bucket = this.days.get(day)
    if (!bucket) {
      bucket = { tokens: 0, requests: 0, credits: 0, metered: 0, turns: 0, toolRuns: 0, shellRuns: 0, shellFailures: 0 }
      this.days.set(day, bucket)
    }
    return bucket
  }

  private tally(kind: TallyKind, name: string, at: number): void {
    this.tallies[kind].add(name, at)
    const day = localDay(at)
    let maps = this.dayTallies.get(day)
    if (!maps) {
      maps = { tools: new TallyMap(), skills: new TallyMap(), commands: new TallyMap() }
      this.dayTallies.set(day, maps)
    }
    maps[kind].add(name, at)
  }

  private agentStats(): AgentStats | null {
    if (this.agent === null) return null
    let stats = this.agents.get(this.agent)
    if (!stats) {
      stats = { requests: 0, tokens: 0, credits: 0, toolRuns: 0, contextTokens: 0, model: null, firstAt: Number.POSITIVE_INFINITY, lastAt: 0 }
      this.agents.set(this.agent, stats)
    }
    return stats
  }

  private addRuntime(raw: Json, at: number): void {
    if (typeof raw.contextWindow === "number" && raw.contextWindow > 0) this.configuredWindow = raw.contextWindow
    if (typeof raw.model !== "string" || !raw.model) return
    if (raw.model !== "auto") this.model = raw.model
    const next = { model: raw.model, effort: typeof raw.reasoningEffort === "string" && raw.reasoningEffort ? raw.reasoningEffort : null }
    const previous = this.runtime
    this.runtime = next
    if (previous && (previous.model !== next.model || previous.effort !== next.effort)) {
      this.pushEvent({ kind: "model", at, from: runtimeLabel(previous), to: runtimeLabel(next), requestIndex: this.requests.length })
    }
  }

  private addUser(raw: Json, at: number | null, main: boolean): void {
    // Slash-command turns carry humanInput on an isMeta entry, so humanInput alone marks a turn.
    const human = main && raw.humanInput != null
    if (human) {
      this.turns += 1
      if (at !== null) this.bucket(at).turns += 1
      const input = isRecord(raw.humanInput) && typeof raw.humanInput.text === "string" ? raw.humanInput.text : messageText(raw.message)
      if (input.trim()) this.prompts.set(this.turns, excerpt(input, PROMPT_LIMIT))
    }
    const message = isRecord(raw.message) ? raw.message : null
    const content = message && Array.isArray(message.content) ? message.content : []
    const results = content.filter((block): block is Json => isRecord(block) && block.type === "tool_result")
    if (main) {
      if (results.length > 0) this.cause = "tools"
      else if (human) this.cause = "prompt"
      else if (this.cause !== "prompt" && this.cause !== "compact") this.cause = "other"
      this.estimateUser(message, results)
    }
    if (main && at !== null) {
      // Every prompt, notification or tool result starts a new wait on the model; a tool result
      // also stretches the running tool span up to it.
      if (results.length > 0 && this.openToolSpan) this.openToolSpan.end = Math.max(this.openToolSpan.end, at)
      else this.openToolSpan = null
      this.waitingSince = at
    }
    for (const block of results) {
      const id = typeof block.tool_use_id === "string" ? block.tool_use_id : null
      const tool = id ? this.seenToolUses.get(id) : undefined
      if (block.is_error === true && tool) this.toolErrors += 1
      // toolUseResult describes the entry's result, so it's only trusted when there is one.
      const result = results.length === 1 ? raw.toolUseResult : null
      if (tool && SEARCH_TOOLS.has(tool) && isRecord(result) && at !== null) this.addSearch(result, at)
      if (tool && AGENT_TOOLS.has(tool) && id && isRecord(result)) this.addOutcome(id, result)
      const run = id ? this.openRuns.get(id) : undefined
      if (!run || !id) continue
      this.openRuns.delete(id)
      const outcome = commandOutcome(result, block.is_error === true)
      run.status = outcome.status
      run.exitCode = outcome.exitCode
      if (at !== null) run.durationMs = Math.max(0, at - run.at)
      if (outcome.status === "ok" || outcome.status === "failed") {
        const bucket = this.bucket(run.at)
        bucket.shellRuns += 1
        if (outcome.status === "failed") bucket.shellFailures += 1
      }
    }
  }

  /** Adds a main-agent user entry to the context estimate: tool results, or the message text. */
  private estimateUser(message: Json | null, results: readonly Json[]): void {
    if (!message) return
    if (results.length > 0) {
      for (const block of results) this.estimate.toolCalls += contentTokens(block.content)
      return
    }
    this.estimate.user += contentTokens(message.content)
  }

  private addAttachment(raw: Json, at: number): void {
    const attachment = isRecord(raw.attachment) ? raw.attachment : null
    const type = typeof attachment?.type === "string" ? attachment.type : null
    if (!attachment || !type) return
    if (type === "plan_mode" || type === "plan_mode_exit" || type === "auto_mode" || type === "auto_mode_exit") {
      const mode = type.startsWith("plan") ? "plan" : "auto"
      const active = !type.endsWith("_exit") && attachment.isActive !== false
      if (this.modes[mode] !== active) {
        this.modes[mode] = active
        this.pushEvent({ kind: "mode", at, mode, active, requestIndex: this.requests.length })
      }
    }
    const tokens = textTokens(attachment)
    if (type === "skill_listing" || type === "invoked_skills") this.estimate.skills += tokens
    else this.estimate.injected += tokens
    const item = INJECT_ITEMS[type]
    if (!item || tokens === 0) return
    const { label, count } = injectLabel(type, attachment)
    this.pushEvent({ kind: "inject", at, item, label, count, tokens, requestIndex: this.requests.length })
  }

  private addAssistant(raw: Json, timestamp: number | null, main: boolean): void {
    const message = isRecord(raw.message) ? raw.message : null
    if (!message) return
    const at = timestamp ?? this.lastAt
    const messageId = typeof message.id === "string" ? message.id : null
    let pending = messageId ? this.pending.get(messageId) : undefined
    if (!pending) {
      pending = { tools: [], reply: null, request: null }
      if (messageId) this.pending.set(messageId, pending)
    }
    // The request this message is (or, until its usage arrives, will be) counted as.
    const known = messageId ? this.seenMessages.get(messageId) : undefined
    const requestIndex = main ? (known !== undefined && known >= 0 ? known : this.requests.length) : null
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isRecord(block)) continue
        if (block.type === "tool_use") this.addToolUse(block, at, main, pending.tools, requestIndex)
        if (!main) continue
        if (block.type === "text" && typeof block.text === "string") {
          this.estimate.answers += estimateTokens(block.text)
          if (pending.reply === null && block.text.trim()) {
            pending.reply = excerpt(block.text, REPLY_LIMIT)
            if (pending.request) pending.request.reply = pending.reply
          }
        } else if (block.type === "thinking" && typeof block.thinking === "string") {
          this.estimate.reasoning += estimateTokens(block.thinking)
        } else if (block.type === "tool_use") {
          this.estimate.toolCalls += textTokens(block.input) + estimateTokens(typeof block.name === "string" ? block.name : "")
        }
      }
    }
    const usage = isRecord(message.usage) ? message.usage : null
    if (!usage || (messageId && this.seenMessages.has(messageId))) return
    if (messageId) this.seenMessages.set(messageId, main ? this.requests.length : -1)
    const input = readCount(usage.input_tokens)
    const cacheRead = readCount(usage.cache_read_input_tokens)
    const cacheCreate = readCount(usage.cache_creation_input_tokens)
    const output = readCount(usage.output_tokens)
    // Qoder reports input_tokens inclusive of cached tokens; Anthropic-style BYOK reports
    // them separately, which shows up as cache reads larger than the input count.
    const prompt = cacheRead > input ? input + cacheRead + cacheCreate : input
    const reported = typeof usage.credits === "number" && Number.isFinite(usage.credits) && usage.credits >= 0 ? usage.credits : null
    // Requests marked not billable still reported their metering; they just don't cost anything.
    const credits = reported === null ? null : usage.billable === false ? 0 : reported
    const original = credits === null ? 0 : usage.billable === false ? 0 : readCredits(usage.original_credits) ?? credits
    this.requestCount += 1
    this.prompt += prompt
    this.cacheRead += cacheRead
    this.cacheCreate += cacheCreate
    this.output += output
    const bucket = this.bucket(at)
    bucket.tokens += prompt + output
    bucket.requests += 1
    if (credits !== null) {
      this.credits += credits
      this.originalCredits += original
      this.metered += 1
      bucket.credits += credits
      bucket.metered += 1
    }
    const model = typeof message.model === "string" && message.model ? message.model : null
    const usageByModel = this.models.get(model ?? "?") ?? { requests: 0, tokens: 0, credits: 0, metered: 0 }
    usageByModel.requests += 1
    usageByModel.tokens += prompt + output
    if (credits !== null) {
      usageByModel.credits += credits
      usageByModel.metered += 1
    }
    this.models.set(model ?? "?", usageByModel)
    if (!main) {
      const stats = this.agentStats()
      if (stats) {
        stats.requests += 1
        stats.tokens += prompt + output
        stats.credits += credits ?? 0
        stats.contextTokens = prompt
        if (model) stats.model = model
      }
      return
    }
    if (model && model !== "auto") this.model = model
    this.contextTokens = prompt
    const ratio = typeof usage.context_usage_ratio === "number" ? usage.context_usage_ratio : 0
    if (ratio > 0 && input > 0) this.derivedWindow = Math.round(input / ratio)
    let latencyMs: number | null = null
    if (timestamp !== null) {
      if (this.waitingSince !== null && this.addSpan("model", this.waitingSince, timestamp)) {
        latencyMs = timestamp - this.waitingSince
        this.timedOutput += output
      }
      this.waitingSince = null
      this.openToolSpan = null
      if (pending.tools.length > 0) {
        this.openToolSpan = { kind: "tool", start: timestamp, end: timestamp }
        this.spans.push(this.openToolSpan)
      }
    }
    const request: MutableRequest = {
      at,
      turn: this.turns,
      prompt,
      cacheRead,
      output,
      model,
      tools: pending.tools,
      latencyMs,
      credits: credits === null ? null : roundCredits(credits),
      cause: this.cause,
      reply: pending.reply,
    }
    pending.request = request
    this.requests.push(request)
    this.cause = "other"
  }

  /** Records a span unless it is empty, backwards or too long to be work; true when recorded. */
  private addSpan(kind: SpanKind, start: number, end: number): boolean {
    const length = end - start
    if (!(length > 0) || length > SPAN_CAP_MS) return false
    this.spans.push({ kind, start, end })
    return true
  }

  private addToolUse(block: Json, at: number, main: boolean, pending: string[], requestIndex: number | null): void {
    const name = typeof block.name === "string" ? block.name : null
    if (!name) return
    const id = typeof block.id === "string" ? block.id : null
    if (id) {
      if (this.seenToolUses.has(id)) return
      this.seenToolUses.set(id, name)
      if (AGENT_TOOLS.has(name)) this.launches.set(id, main ? null : this.agent)
    }
    this.toolRuns += 1
    this.bucket(at).toolRuns += 1
    this.tally("tools", name, at)
    if (main) pending.push(name)
    else {
      const stats = this.agentStats()
      if (stats) stats.toolRuns += 1
    }
    const input = isRecord(block.input) ? block.input : {}
    if (name === "Skill" && typeof input.skill === "string") this.tally("skills", input.skill, at)
    if (SHELL_TOOLS.has(name) && typeof input.command === "string") {
      const programs = commandPrograms(input.command)
      for (const program of programs) this.tally("commands", program, at)
      if (id) this.addRun({ id, command: input.command.trim().slice(0, COMMAND_TEXT_LIMIT), programs, at, requestIndex, subagent: !main })
    }
    const path =
      typeof input.file_path === "string" ? input.file_path : typeof input.notebook_path === "string" ? input.notebook_path : null
    if (path && (READ_TOOLS.has(name) || WRITE_TOOLS.has(name))) {
      const entry = this.addFile(path, WRITE_TOOLS.has(name) ? editLines(name, input) : null, at)
      if (entry && IMAGE_FILE.test(path)) entry.image = true
    }
  }

  /** Counts each file a Grep or Glob result lists as one search hit. */
  private addSearch(result: Json, at: number): void {
    if (!Array.isArray(result.filenames)) return
    for (const name of result.filenames.slice(0, SEARCH_FILE_LIMIT)) {
      if (typeof name !== "string" || !name) continue
      const entry = this.fileEntry(isAbsolute(name) || !this.cwd ? name : join(this.cwd, name), at)
      if (!entry) continue
      entry.searches += 1
      entry.lastAt = Math.max(entry.lastAt, at)
    }
  }

  private addOutcome(toolUseId: string, result: Json): void {
    if (result.kind !== "agent-result" || typeof result.agentId !== "string") return
    const report = typeof result.content === "string" ? result.content : messageText({ content: result.content })
    this.outcomes.set(result.agentId, {
      toolUseId,
      state: typeof result.state === "string" ? result.state : null,
      result: report.trim() ? excerpt(report, REPLY_LIMIT) : null,
    })
  }

  private addRun(run: Pick<CommandRun, "id" | "command" | "programs" | "at" | "requestIndex" | "subagent">): void {
    const entry: Mutable<CommandRun> = { ...run, durationMs: null, status: "running", exitCode: null, turn: this.turns }
    this.runs.push(entry)
    this.openRuns.set(run.id, entry)
    if (this.runs.length > DETAIL_LIMITS.commands * 2) {
      const dropped = this.runs.length - DETAIL_LIMITS.commands
      for (const old of this.runs.slice(0, dropped)) this.openRuns.delete(old.id)
      this.runs = this.runs.slice(dropped)
      this.runsDropped += dropped
    }
  }

  private fileEntry(path: string, at: number) {
    let entry = this.files.get(path)
    if (!entry) {
      if (this.files.size >= FILE_TRACK_LIMIT) return null
      entry = { reads: 0, writes: 0, added: 0, removed: 0, searches: 0, image: false, lastAt: at }
      this.files.set(path, entry)
    }
    return entry
  }

  /** `lines` is what a write changed, or null for a read. */
  private addFile(path: string, lines: LineChange | null, at: number) {
    const entry = this.fileEntry(path, at)
    if (!entry) return null
    if (lines) {
      entry.writes += 1
      entry.added += lines.added
      entry.removed += lines.removed
    } else {
      entry.reads += 1
    }
    entry.lastAt = Math.max(entry.lastAt, at)
    return entry
  }

  private addSystem(raw: Json, at: number, main: boolean): void {
    const content = typeof raw.content === "string" ? raw.content : ""
    if (raw.subtype === "informational") {
      const skill = SKILL_ACTIVATED.exec(content)?.[1]
      if (skill) this.tally("skills", skill, at)
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
      // What the window held is gone; the summary that replaces it arrives as the next user entry.
      this.estimate = emptyEstimate()
      this.cause = "compact"
      // The boundary is written when compaction ends; its reported duration ran up to here, but
      // never further back than the previous span.
      const durationMs = readNullableCount(metadata.durationMs)
      const floor = Math.max(this.waitingSince ?? Number.NEGATIVE_INFINITY, this.spans.at(-1)?.end ?? Number.NEGATIVE_INFINITY)
      if (durationMs) this.addSpan("compact", Math.max(at - durationMs, floor), at)
      this.openToolSpan = null
      this.waitingSince = at
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

function emptyEstimate(): Mutable<ContextEstimate> {
  return { user: 0, injected: 0, skills: 0, toolCalls: 0, reasoning: 0, answers: 0 }
}

function fileWeight(file: FileActivity): number {
  return (file.reads + file.writes) * 2 + file.searches
}

function runtimeLabel(runtime: { readonly model: string; readonly effort: string | null }): string {
  return runtime.effort ? `${runtime.model} · ${runtime.effort}` : runtime.model
}

/** An outcome reported by a subagent's launching call, as one of the statuses the view shows. */
export function agentStatus(state: string | null): AgentStatus {
  if (state === null) return "unknown"
  if (state === "completed") return "done"
  if (state === "running" || state === "pending") return "running"
  if (state === "cancelled" || state === "killed" || state === "interrupted" || state === "stopped") return "stopped"
  return "failed"
}

/** Names what an attachment injected and how many items it lists. */
function injectLabel(type: string, attachment: Json): { label: string; count: number | null } {
  const names = (value: unknown, key?: string): string[] =>
    Array.isArray(value)
      ? value.flatMap((item) => (typeof item === "string" ? [item] : key && isRecord(item) && typeof item[key] === "string" ? [item[key] as string] : []))
      : []
  const list = (items: string[]) => ({ label: excerpt(items.join(", "), LABEL_LIMIT), count: items.length })
  switch (type) {
    case "skill_listing": {
      const count = typeof attachment.skillCount === "number" ? attachment.skillCount : names(attachment.names).length
      return { label: excerpt(names(attachment.names).join(", "), LABEL_LIMIT), count }
    }
    case "invoked_skills":
      return list(names(attachment.skills, "name"))
    case "relevant_memories":
    case "post_compact_restored_files":
      return list(names(attachment.files, "filePath").map(fileName))
    case "hook_output":
      return { label: typeof attachment.hookEventName === "string" ? attachment.hookEventName : "", count: null }
    case "hook_system_message":
      return { label: typeof attachment.hookName === "string" ? attachment.hookName : "", count: null }
    case "mcp_instructions_delta":
    case "mcp_lazy_tools_delta":
      return list(names(attachment.addedNames))
    case "agent_listing_delta":
      return list(names(attachment.addedTypes))
    case "file":
      return { label: typeof attachment.filename === "string" ? fileName(attachment.filename) : "", count: null }
    default:
      return { label: "", count: null }
  }
}

function fileName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path
}

/**
 * Rough token count of `text`: about four characters a token for Latin text and code, and nearer
 * one for CJK. Multi-byte characters are counted from the UTF-8 length, which is computed natively.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const wide = Math.max(0, (Buffer.byteLength(text) - text.length) / 2)
  return Math.round((text.length - wide) / 4 + wide * 0.7)
}

/** Estimated tokens of every string in a value, skipping fields that only name or locate something. */
function textTokens(value: unknown, depth = 0): number {
  if (typeof value === "string") return estimateTokens(value)
  if (depth > 6 || typeof value !== "object" || value === null) return 0
  let total = 0
  if (Array.isArray(value)) for (const item of value) total += textTokens(item, depth + 1)
  else for (const [key, item] of Object.entries(value)) if (!METADATA_KEYS.has(key)) total += textTokens(item, depth + 1)
  return total
}

/** Estimated tokens of message content: a string, or text, tool-result and image blocks. */
function contentTokens(content: unknown): number {
  if (typeof content === "string") return estimateTokens(content)
  if (!Array.isArray(content)) return 0
  let total = 0
  for (const block of content) {
    if (typeof block === "string") total += estimateTokens(block)
    else if (isRecord(block)) {
      if (block.type === "image") total += IMAGE_TOKENS
      else if (typeof block.text === "string") total += estimateTokens(block.text)
      else if (block.content !== undefined) total += contentTokens(block.content)
    }
  }
  return total
}

function messageText(message: unknown): string {
  const content = isRecord(message) ? message.content : null
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((block) => (typeof block === "string" ? block : isRecord(block) && typeof block.text === "string" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
}

/** The start of `text` on one line, cut to `limit` characters. */
function excerpt(text: string, limit: number): string {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > limit ? `${line.slice(0, limit - 1).trimEnd()}…` : line
}

/**
 * How a shell run ended, from its tool result. A non-zero exit that the tool explains (grep's
 * "No matches found") is not a failure.
 */
export function commandOutcome(result: unknown, isError: boolean): { readonly status: CommandStatus; readonly exitCode: number | null } {
  const info = isRecord(result) ? result : {}
  const exitCode = typeof info.exitCode === "number" && Number.isFinite(info.exitCode) ? info.exitCode : null
  if (info.kind === "cancelled" || info.interrupted === true || (info.kind === "tool-status" && info.status === "cancelled")) {
    return { status: "cancelled", exitCode }
  }
  if (info.kind === "backgrounded" || (info.kind === undefined && typeof info.taskId === "string" && !isError)) {
    return { status: "background", exitCode }
  }
  if (isError || (exitCode !== null && exitCode !== 0 && typeof info.returnCodeInterpretation !== "string")) return { status: "failed", exitCode }
  return { status: "ok", exitCode }
}

interface LineChange {
  readonly added: number
  readonly removed: number
}

/** Lines a write tool's input adds and removes. Edits count only the lines that differ. */
export function editLines(tool: string, input: Json): LineChange {
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  if (tool === "Write") return { added: lineCount(text(input.content)), removed: 0 }
  if (tool === "NotebookEdit") return { added: lineCount(text(input.new_source)), removed: 0 }
  const edits = tool === "MultiEdit" && Array.isArray(input.edits) ? input.edits.filter(isRecord) : [input]
  let added = 0
  let removed = 0
  for (const edit of edits) {
    const change = lineDiff(text(edit.old_string), text(edit.new_string))
    added += change.added
    removed += change.removed
  }
  return { added, removed }
}

function lineCount(text: string): number {
  if (!text) return 0
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0)
}

/** Lines left once the lines both sides share at the start and end are set aside. */
function lineDiff(before: string, after: string): LineChange {
  const old = before ? before.split("\n") : []
  const next = after ? after.split("\n") : []
  let head = 0
  while (head < old.length && head < next.length && old[head] === next[head]) head += 1
  let tail = 0
  while (tail < old.length - head && tail < next.length - head && old[old.length - 1 - tail] === next[next.length - 1 - tail]) tail += 1
  return { added: next.length - head - tail, removed: old.length - head - tail }
}

function spanLength(span: Span): number {
  return span.end - span.start
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

function readCredits(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

/** Credits are fractional per request; four decimals keep sums exact enough without float noise. */
export function roundCredits(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
