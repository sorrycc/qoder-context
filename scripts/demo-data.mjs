// Writes synthetic qodercli transcripts for screenshots and demos, so no real session shows.
// Usage: node scripts/demo-data.mjs <config dir>
// Then point the plugin at it with QODER_CONFIG_DIR=<config dir> (scripts/preview.mjs --config does).
// The data is seeded, and dated relative to now so the ranges and heatmap have something in them.
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const target = process.argv[2]
if (!target) {
  console.error("Usage: node scripts/demo-data.mjs <config dir>")
  process.exit(1)
}
const projectsRoot = join(resolve(target), "projects")

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const SYSTEM_TOKENS = 17_800
const HOME = "/Users/demo/code"

let seed = 20261118
function random() {
  seed = (seed + 0x6d2b79f5) | 0
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}
const between = (low, high) => low + random() * (high - low)
const int = (low, high) => Math.floor(between(low, high + 1))
const pick = (items) => items[Math.floor(random() * items.length)]
const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(random() * 16)
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16)
  })

const CODE = [
  "export async function handler(request: Request): Promise<Response> {",
  "  const session = await sessions.get(request.headers.get(\"x-session\"))",
  "  if (!session) return new Response(\"unauthorized\", { status: 401 })",
  "  for (const item of cart.items) total += item.price * item.quantity",
  "  await queue.publish({ type: \"order.created\", orderId: order.id })",
  "  const retries = Math.min(attempt, MAX_RETRIES) * BACKOFF_MS",
  "  logger.info({ orderId, attempt }, \"payment attempt\")",
  "  return json({ ok: true, id: order.id, status: order.status })",
  "describe(\"checkout\", () => { it(\"retries a declined charge once\", async () => {",
  "}",
]
/** Code-like text of about `tokens` tokens (four characters a token). */
function filler(tokens) {
  const lines = []
  let chars = 0
  while (chars < tokens * 4) {
    const line = pick(CODE)
    lines.push(line)
    chars += line.length + 1
  }
  return lines.join("\n")
}
const textTokens = (text) => Math.round(text.length / 4)

/**
 * Builds one transcript. Tracks the context the way the fold estimates it, so the prompt sizes
 * in `usage` and the composition the view derives agree.
 */
class Transcript {
  constructor({ id, cwd, start, model, window, branch = "main", tag = id.slice(0, 6) }) {
    this.id = id
    // Message and tool-use ids must be unique across a session and its subagents.
    this.tag = tag
    this.cwd = cwd
    this.branch = branch
    this.clock = start
    this.model = model
    this.window = window
    this.context = SYSTEM_TOKENS
    this.lines = []
    this.messages = 0
    this.tools = 0
    this.subagents = []
  }

  push(entry) {
    this.lines.push(JSON.stringify({ sessionId: this.id, timestamp: new Date(this.clock).toISOString(), ...entry }))
  }

  wait(ms) {
    this.clock += Math.round(ms)
  }

  runtime(model = this.model, reasoningEffort = null) {
    this.model = model
    this.push({ type: "runtime-config", model, reasoningEffort, contextWindow: this.window })
  }

  title(text) {
    this.push({ type: "ai-title", aiTitle: text })
  }

  attach(attachment) {
    this.context += textTokens(JSON.stringify(attachment)) * 0.8
    this.push({ type: "attachment", attachment })
  }

  human(text) {
    this.wait(between(1, 6) * MINUTE)
    this.context += textTokens(text)
    this.push({ type: "user", cwd: this.cwd, gitBranch: this.branch, humanInput: { text }, message: { role: "user", content: text } })
  }

  /** One request: an optional reply text and tool calls, each with its result after `toolMs`. */
  request({ text = null, calls = [], output = int(180, 1400), latency = between(4, 22) * 1000 } = {}) {
    this.wait(latency)
    const id = `msg_${this.tag}_${++this.messages}`
    const content = []
    if (text) content.push({ type: "text", text })
    const uses = calls.map((call) => ({ ...call, id: `toolu_${this.tag}_${++this.tools}` }))
    for (const use of uses) content.push({ type: "tool_use", id: use.id, name: use.name, input: use.input })
    const prompt = Math.round(this.context)
    const cacheRead = Math.round(prompt * between(0.72, 0.94))
    const credits = Math.round((prompt / 120_000 + output / 9_000) * between(0.9, 1.3) * 1e4) / 1e4
    this.push({
      type: "assistant",
      cwd: this.cwd,
      message: {
        id,
        model: this.model,
        role: "assistant",
        content,
        usage: {
          input_tokens: prompt,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: cacheRead,
          output_tokens: output,
          credits,
          original_credits: Math.round(credits * 1.25 * 1e4) / 1e4,
          context_usage_ratio: prompt / this.window,
        },
      },
    })
    this.context += output * 0.6 + (text ? textTokens(text) : 0)
    for (const use of uses) {
      this.context += textTokens(JSON.stringify(use.input))
      this.wait(use.toolMs ?? between(0.4, 6) * 1000)
      const body = use.result ?? filler(use.resultTokens ?? int(120, 1600))
      this.context += textTokens(body)
      this.push({
        type: "user",
        cwd: this.cwd,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: use.id, is_error: use.error === true, content: body }] },
        ...(use.toolUseResult ? { toolUseResult: use.toolUseResult } : {}),
      })
    }
    return uses
  }

  compact(trigger = "auto") {
    const preTokens = Math.round(this.context)
    const durationMs = int(38_000, 70_000)
    this.wait(durationMs)
    const postTokens = int(7_000, 11_000)
    this.push({ type: "system", subtype: "compact_boundary", content: "Conversation compacted", compactMetadata: { trigger, preTokens, postTokens, durationMs, messagesSummarized: int(120, 260) } })
    this.context = SYSTEM_TOKENS
    const summary = `Summary of the conversation so far:\n${filler(postTokens - SYSTEM_TOKENS > 0 ? 3_000 : 2_000)}`
    this.context += textTokens(summary)
    this.push({ type: "user", isCompactSummary: true, message: { role: "user", content: summary } })
  }

  system(subtype, content) {
    this.push({ type: "system", subtype, content })
  }
}

const read = (path, tokens) => ({ name: "Read", input: { file_path: path }, resultTokens: tokens ?? int(400, 2600) })
const edit = (path, removed, added) => ({
  name: "Edit",
  input: { file_path: path, old_string: filler(removed * 15).split("\n").slice(0, removed).join("\n"), new_string: filler(added * 15).split("\n").slice(0, added).join("\n") },
  resultTokens: 40,
})
const write = (path, lines) => ({ name: "Write", input: { file_path: path, content: filler(lines * 15).split("\n").slice(0, lines).join("\n") }, resultTokens: 30 })
const grep = (pattern, cwd, files) => ({
  name: "Grep",
  input: { pattern, path: cwd },
  resultTokens: 30 + files.length * 12,
  toolUseResult: { filenames: files.map((file) => `${cwd}/${file}`), numFiles: files.length },
})
const glob = (pattern, cwd, files) => ({ name: "Glob", input: { pattern }, resultTokens: files.length * 10, toolUseResult: { filenames: files, numFiles: files.length } })
const bash = (command, { exitCode = 0, ms = between(0.6, 9) * 1000, kind, interpretation, tokens } = {}) => ({
  name: "Bash",
  input: { command },
  toolMs: ms,
  error: exitCode !== 0 && !interpretation,
  resultTokens: tokens ?? int(60, 900),
  toolUseResult:
    kind === "backgrounded"
      ? { kind: "backgrounded", taskId: `bash_${int(1000, 9999)}` }
      : kind === "cancelled"
        ? { interrupted: true, exitCode: null }
        : { exitCode, ...(interpretation ? { returnCodeInterpretation: interpretation } : {}) },
})

/** The session the session-view screenshots show: long, with a compaction, subagents and every kind of event. */
function heroSession(start) {
  const cwd = `${HOME}/storefront`
  const t = new Transcript({ id: "5f2c8a41-7d3e-4b9a-9c1e-2a6f0d4b8e17", cwd, start, model: "ultimate", window: 200_000, branch: "feat/checkout-retry" })
  t.runtime("ultimate", "high")
  t.attach({ type: "hook_output", hookEventName: "SessionStart", output: "Repository conventions: run `pnpm test` before committing; API handlers live in src/api." })
  t.attach({ type: "skill_listing", skillCount: 9, names: ["review", "simplify", "release-notes", "db-migrate", "write-tests", "explain", "bench", "lint-fix", "changelog"], content: filler(1_400) })
  t.attach({ type: "mcp_lazy_tools_delta", addedNames: ["linear.search_issues", "linear.get_issue", "sentry.list_events"], content: filler(900) })
  t.title("Add checkout retry with idempotency keys")

  t.human("Payments sometimes get charged twice when the provider times out. Add retries to checkout with idempotency keys so a retried charge is never billed twice.")
  t.attach({ type: "relevant_memories", files: [{ filePath: `${cwd}/AGENTS.md`, content: filler(600) }, { filePath: `${cwd}/src/api/AGENTS.md`, content: filler(300) }] })
  t.request({ text: "I'll look at how checkout calls the payment provider first.", calls: [grep("charge\\(", cwd, ["src/api/checkout.ts", "src/payments/provider.ts", "src/payments/stripe.ts", "test/checkout.test.ts"])] })
  t.request({ calls: [read(`${cwd}/src/api/checkout.ts`, 3_200), read(`${cwd}/src/payments/provider.ts`, 2_100)] })
  const [explore] = t.request({
    text: "Let me have an agent map every caller of the provider while I read the tests.",
    calls: [{ name: "Agent", input: { subagent_type: "Explore", description: "Map payment provider callers", prompt: "Find every call site of PaymentProvider.charge and refund." }, resultTokens: 500, toolMs: 95_000 }],
  })
  t.subagents.push({ id: "aexplore-3c1d9e7a", type: "Explore", description: "Map payment provider callers", toolUseId: explore.id, state: "completed", report: "Found 4 call sites: checkout.ts (charge), refunds.ts (refund), subscriptions/renew.ts (charge), admin/manual-charge.ts (charge). Only checkout retries today." })
  t.request({ calls: [read(`${cwd}/test/checkout.test.ts`, 2_800), bash("pnpm vitest run test/checkout.test.ts", { ms: 7_400 })] })

  t.human("Plan it first, I want to see the approach before you edit anything.")
  t.attach({ type: "plan_mode", isActive: true })
  t.request({ text: "Plan: 1) generate an idempotency key per checkout attempt and persist it with the order; 2) pass it to the provider on every charge; 3) retry timeouts with capped exponential backoff; 4) tests for a timeout followed by success.", output: 1_900, latency: 28_000 })
  t.human("Looks good, go ahead.")
  t.attach({ type: "plan_mode_exit" })
  t.request({ calls: [edit(`${cwd}/src/payments/provider.ts`, 6, 24)] })
  t.request({ calls: [edit(`${cwd}/src/api/checkout.ts`, 18, 52), write(`${cwd}/src/payments/idempotency.ts`, 64)] })
  t.request({ calls: [bash("pnpm tsc --noEmit", { ms: 11_200 })] })
  t.request({ calls: [bash("pnpm vitest run test/checkout.test.ts", { exitCode: 1, ms: 8_300, tokens: 1_400 })] })
  t.request({ text: "One test expects a single charge call; with the retry it now sees two. Updating the test to assert the same idempotency key on both.", calls: [edit(`${cwd}/test/checkout.test.ts`, 8, 31)] })
  t.request({ calls: [bash("pnpm vitest run test/checkout.test.ts", { ms: 7_900 })] })

  t.human("Use /write-tests to cover the backoff edge cases too.")
  t.request({ calls: [{ name: "Skill", input: { skill: "write-tests" }, resultTokens: 200 }] })
  t.attach({ type: "invoked_skills", skills: [{ name: "write-tests", content: filler(1_800) }] })
  t.request({ calls: [read(`${cwd}/src/payments/idempotency.ts`, 900), write(`${cwd}/test/idempotency.test.ts`, 96)] })
  t.request({ calls: [bash("pnpm vitest run test/idempotency.test.ts", { ms: 6_100 })] })
  t.request({ calls: [glob("src/**/*.retry.ts", cwd, [`${cwd}/src/queue/publish.retry.ts`, `${cwd}/src/email/send.retry.ts`])] })
  t.request({ calls: [read(`${cwd}/src/queue/publish.retry.ts`, 1_400), edit(`${cwd}/src/payments/idempotency.ts`, 4, 11)] })

  t.human("Subscriptions renew through the same provider, do they need the key too?")
  t.request({ calls: [read(`${cwd}/src/subscriptions/renew.ts`, 2_400), grep("renewSubscription", cwd, ["src/subscriptions/renew.ts", "src/jobs/nightly.ts", "test/renew.test.ts"])] })
  t.request({ calls: [edit(`${cwd}/src/subscriptions/renew.ts`, 9, 22), read(`${cwd}/test/renew.test.ts`, 1_900)] })
  t.request({ calls: [bash("pnpm vitest run test/renew.test.ts", { ms: 6_800 })] })
  t.request({ calls: [bash("grep -rn \"chargeWithoutKey\" src", { exitCode: 1, interpretation: "No matches found", ms: 300, tokens: 10 })] })
  t.request({ calls: [read(`${cwd}/src/admin/manual-charge.ts`, 1_600), read(`${cwd}/src/payments/refunds.ts`, 1_800)] })
  t.request({ calls: [edit(`${cwd}/src/admin/manual-charge.ts`, 3, 9)] })

  t.human("Run the whole suite and the e2e checkout flow.")
  t.request({ calls: [bash("pnpm vitest run", { ms: 34_000, tokens: 2_200 })] })
  t.request({ calls: [bash("pnpm playwright test e2e/checkout.spec.ts", { kind: "backgrounded", ms: 1_200 })] })
  t.request({ calls: [read(`${cwd}/e2e/checkout.spec.ts`, 2_100), read(`${cwd}/playwright.config.ts`, 700)] })
  t.request({ calls: [bash("tail -n 40 test-results/e2e.log", { ms: 400, tokens: 1_200 })] })
  t.system("api_retry", "Request timed out; retrying in 2s (attempt 1 of 3)")
  t.request({ calls: [read(`${cwd}/src/api/checkout.ts`, 3_400), read(`${cwd}/src/payments/stripe.ts`, 2_600)], latency: 31_000 })
  t.request({ calls: [read(`${cwd}/src/api/orders.ts`, 3_000), read(`${cwd}/src/db/schema.ts`, 4_200)] })
  t.request({ calls: [read(`${cwd}/migrations/0041_orders.sql`, 900), read(`${cwd}/src/db/orders.ts`, 2_800)] })
  for (let index = 0; index < 8; index += 1) {
    t.request({ calls: [read(`${cwd}/src/${pick(["api/cart.ts", "api/orders.ts", "payments/stripe.ts", "db/orders.ts", "jobs/nightly.ts"])}`, int(2_600, 4_400)), bash(pick(["pnpm vitest run test/checkout.test.ts", "pnpm tsc --noEmit", "git diff --stat"]), { ms: between(2, 9) * 1000, tokens: int(800, 2_000) })] })
  }
  t.compact("auto")
  t.attach({ type: "post_compact_restored_files", files: [{ filePath: `${cwd}/src/api/checkout.ts`, content: filler(1_600) }, { filePath: `${cwd}/src/payments/idempotency.ts`, content: filler(700) }] })

  t.human("Persist the key in a migration so a retry after a deploy still reuses it.")
  t.runtime("ultimate", "medium")
  t.request({ calls: [{ name: "Skill", input: { skill: "db-migrate" }, resultTokens: 150 }] })
  t.attach({ type: "invoked_skills", skills: [{ name: "db-migrate", content: filler(1_200) }] })
  for (const file of ["db/schema.ts", "db/orders.ts", "db/migrate.ts", "api/orders.ts"]) t.request({ calls: [read(`${cwd}/src/${file}`, int(4_000, 6_500))] })
  t.request({ calls: [write(`${cwd}/migrations/0042_order_idempotency_key.sql`, 14), edit(`${cwd}/src/db/schema.ts`, 2, 6)] })
  t.request({ calls: [bash("pnpm db:migrate --dry-run", { ms: 4_300 })] })
  t.request({ calls: [bash("pnpm db:migrate", { ms: 5_100 }), edit(`${cwd}/src/db/orders.ts`, 7, 19)] })
  t.request({ calls: [bash("pnpm vitest run test/db", { exitCode: 1, ms: 9_600, tokens: 1_600 })] })
  t.request({ text: "The fixture factory doesn't set the new column. Fixing it.", calls: [edit(`${cwd}/test/fixtures/orders.ts`, 2, 5), bash("pnpm vitest run test/db", { ms: 8_800 })] })

  t.human("Get a second opinion on the whole change before I open the PR.")
  const [review] = t.request({
    calls: [{ name: "Agent", input: { subagent_type: "general-purpose", description: "Review checkout retry change", prompt: "Review the diff on this branch for double-charge risks." }, resultTokens: 700, toolMs: 140_000 }],
  })
  t.subagents.push({
    id: "ageneral-8b2e4f10",
    type: "general-purpose",
    description: "Review checkout retry change",
    toolUseId: review.id,
    state: "completed",
    report: "No double-charge path found. Two nits: log the idempotency key on retry, and cap total retry time at 20s so checkout never hangs.",
    nested: { id: "areviewer-e41a07c2", type: "code-reviewer", description: "Check migration safety", state: "completed", report: "Migration is additive with a nullable column; safe to deploy before the code." },
  })
  t.request({ text: "Applying both nits.", calls: [edit(`${cwd}/src/api/checkout.ts`, 5, 12)] })
  t.request({ calls: [bash("pnpm vitest run", { ms: 31_000, tokens: 1_900 }), bash("pnpm lint", { ms: 6_200 })] })
  t.request({ calls: [bash("pnpm build", { kind: "cancelled", ms: 18_000 })] })

  t.human("Write the PR description and summarize what changed.")
  t.request({ calls: [bash("git diff --stat main...HEAD", { ms: 500 }), bash("git log --oneline main..HEAD", { ms: 300 })] })
  const [docs] = t.request({ calls: [{ name: "Agent", input: { subagent_type: "Explore", description: "Find docs mentioning checkout retries" }, resultTokens: 200, toolMs: 20_000 }] })
  t.subagents.push({ id: "aexplore-90fd31b6", type: "Explore", description: "Find docs mentioning checkout retries", toolUseId: docs.id, state: null, report: null })
  t.request({ text: "Checkout now retries provider timeouts up to three times with capped backoff. Every attempt sends the same idempotency key, which is stored with the order, so a retried charge is never billed twice.", output: 2_300, latency: 26_000 })
  return t
}

const PROJECTS = [
  { name: "storefront", model: "ultimate", topics: ["Fix cart total rounding", "Add coupon validation", "Speed up product list query", "Migrate images to CDN", "Refactor checkout form state"] },
  { name: "billing-api", model: "qmodel_38max", topics: ["Add invoice PDF export", "Handle webhook replays", "Upgrade to Node 22", "Fix tax calculation for EU", "Add rate limiting to /charges"] },
  { name: "mobile-app", model: "dfmodel", topics: ["Fix login crash on Android 15", "Add push notification settings", "Dark mode for onboarding", "Offline cart sync"] },
  { name: "infra", model: "auto", topics: ["Terraform module for Redis", "Tune autoscaling thresholds", "Rotate staging secrets", "CI cache for pnpm"] },
  { name: "docs-site", model: "lite", topics: ["Write API quickstart", "Fix broken links", "Add search to docs", "Changelog for 2.4"] },
]
const SKILLS = ["review", "simplify", "write-tests", "explain", "lint-fix", "changelog", "release-notes"]
const COMMANDS = ["pnpm test", "pnpm lint", "git status", "git diff", "pnpm tsc --noEmit", "rg TODO src", "terraform plan", "npm run build", "docker compose up -d", "make check", "gh pr view", "curl -s localhost:3000/health"]

/** A shorter everyday session in one of the projects. */
function smallSession(start, project, topic) {
  const cwd = `${HOME}/${project.name}`
  const t = new Transcript({ id: uuid(), cwd, start, model: project.model, window: pick([200_000, 400_000, 1_000_000]) })
  t.runtime()
  t.attach({ type: "skill_listing", skillCount: 7, names: SKILLS, content: filler(1_100) })
  t.title(topic)
  const turns = int(1, 6)
  for (let turn = 0; turn < turns; turn += 1) {
    t.human(turn === 0 ? `${topic}.` : pick(["Looks good, continue.", "Can you also add a test?", "Run the checks again.", "Why did that fail?", "Clean that up a bit."]))
    const requests = int(1, 7)
    for (let index = 0; index < requests; index += 1) {
      const file = `${cwd}/src/${pick(["index", "routes", "utils", "config", "store", "api"])}.ts`
      const roll = random()
      const calls =
        roll < 0.3
          ? [read(file)]
          : roll < 0.5
            ? [edit(file, int(1, 8), int(2, 20))]
            : roll < 0.75
              ? [bash(pick(COMMANDS), { exitCode: random() < 0.14 ? 1 : 0 })]
              : roll < 0.82
                ? [{ name: "Skill", input: { skill: pick(SKILLS) }, resultTokens: 120 }]
                : roll < 0.92
                  ? [grep(pick(["TODO", "export function", "useState"]), cwd, ["src/index.ts", "src/api.ts"])]
                  : []
      t.request({ calls, text: calls.length === 0 ? "Done. The change is in place and the checks pass." : null })
    }
  }
  return t
}

async function save(transcript) {
  const dir = join(projectsRoot, transcript.cwd.replace(/\//g, "-"))
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${transcript.id}.jsonl`)
  await writeFile(file, `${transcript.lines.join("\n")}\n`)
  if (transcript.subagents.length > 0) await saveSubagents(transcript, join(dir, transcript.id, "subagents"))
}

/** Each subagent's transcript and `.meta.json`, and the launching call's result in the parent. */
async function saveSubagents(parent, dir) {
  await mkdir(dir, { recursive: true })
  const write = async (agent, clock, model) => {
    const t = new Transcript({ id: parent.id, cwd: parent.cwd, start: clock, model, window: 200_000, tag: agent.id })
    t.context = 9_000
    t.human(agent.description)
    let launched = null
    for (let index = 0; index < int(4, 9); index += 1) {
      const calls = [pick([read(`${parent.cwd}/src/api/checkout.ts`), grep("charge", parent.cwd, ["src/api/checkout.ts"]), read(`${parent.cwd}/src/payments/provider.ts`)])]
      if (agent.nested && index === 2) {
        calls.push({ name: "Agent", input: { subagent_type: agent.nested.type, description: agent.nested.description }, resultTokens: 200, toolMs: 40_000, toolUseResult: outcome(agent.nested) })
      }
      const [, second] = t.request({ calls, latency: between(3, 12) * 1000 })
      if (second) launched = second.id
    }
    // Subagent entries are read as sidechain entries; the fold keeps their totals apart.
    const lines = t.lines.map((line) => JSON.stringify({ ...JSON.parse(line), isSidechain: true, agentId: agent.id }))
    await writeFile(join(dir, `agent-${agent.id}.jsonl`), `${lines.join("\n")}\n`)
    await writeFile(join(dir, `agent-${agent.id}.meta.json`), JSON.stringify({ agentType: agent.type, description: agent.description, toolUseId: agent.toolUseId }))
    if (agent.nested) await write({ ...agent.nested, toolUseId: launched }, clock + 60_000, "qfmodel")
  }
  for (const agent of parent.subagents) {
    const launch = parent.lines.findIndex((line) => line.includes(`"id":"${agent.toolUseId}"`))
    const clock = Date.parse(JSON.parse(parent.lines[launch]).timestamp) + 1_000
    await write(agent, clock, agent.type === "Explore" ? "lite" : "ultimate")
    // The parent's tool result for the launching call carries the agent's outcome.
    const resultIndex = parent.lines.findIndex((line, index) => index > launch && line.includes(`"tool_use_id":"${agent.toolUseId}"`))
    const entry = JSON.parse(parent.lines[resultIndex])
    if (agent.state) entry.toolUseResult = outcome(agent)
    parent.lines[resultIndex] = JSON.stringify(entry)
  }
  await writeFile(join(projectsRoot, parent.cwd.replace(/\//g, "-"), `${parent.id}.jsonl`), `${parent.lines.join("\n")}\n`)
}

function outcome(agent) {
  return { kind: "agent-result", agentId: agent.id, agentType: agent.type, content: agent.report, state: agent.state }
}

await rm(projectsRoot, { recursive: true, force: true })
const now = Date.now()
const today = new Date(now)
today.setHours(0, 0, 0, 0)

const hero = heroSession(Math.min(now - 3 * 60 * MINUTE, today.getTime() + 9.5 * 60 * MINUTE))
await save(hero)

let sessions = 1
for (let daysAgo = 0; daysAgo < 56; daysAgo += 1) {
  const date = today.getTime() - daysAgo * DAY
  const weekday = new Date(date).getDay()
  const weekend = weekday === 0 || weekday === 6
  // Busier lately, quieter on weekends and further back.
  const base = daysAgo < 7 ? 5 : daysAgo < 21 ? 3 : 1.6
  const count = Math.max(0, Math.round(between(0, base * (weekend ? 0.35 : 1.2))))
  for (let index = 0; index < count; index += 1) {
    const start = date + between(8.5, 19) * 60 * MINUTE
    if (start > now - 20 * MINUTE) continue
    const project = random() < 0.2 ? PROJECTS[0] : pick(PROJECTS)
    await save(smallSession(start, project, pick(project.topics)))
    sessions += 1
  }
}
console.log(`Wrote ${sessions} demo sessions to ${projectsRoot}`)
console.log(`Hero session: ${hero.id} (${hero.cwd})`)
