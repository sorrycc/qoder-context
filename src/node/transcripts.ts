import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import { createInterface } from "node:readline"
import { SessionFold } from "./fold.js"

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/
const PROJECT_LIST_TTL_MS = 30_000

export interface TranscriptFile {
  readonly id: string
  readonly file: string
  /** Changes whenever the main transcript or its subagent folder changes. */
  readonly version: string
  readonly mtimeMs: number
}

/** qodercli keeps transcripts under the product's user config root (`.qoder`, `.qoder-cn`). */
export function resolveProjectsRoot(productId: string, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const prefix = productId === "qoder-cn" ? "QODERCN" : "QODER"
  const explicit = env[`${prefix}_CONFIG_DIR`]
  if (explicit) return join(resolve(explicit), "projects")
  const configHome = env[`${prefix}_CLI_HOME`] || home
  return join(configHome, productId === "qoder-cn" ? ".qoder-cn" : ".qoder", "projects")
}

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID.test(value)
}

export class TranscriptLocator {
  private projectDirs: { readonly at: number; readonly dirs: readonly string[] } | null = null
  private readonly known = new Map<string, string>()

  constructor(readonly root: string) {}

  async find(sessionId: string): Promise<string | null> {
    if (!isSessionId(sessionId)) return null
    const cached = this.known.get(sessionId)
    if (cached && (await stat(cached).catch(() => null))) return cached
    for (const dir of await this.dirs()) {
      const file = join(this.root, dir, `${sessionId}.jsonl`)
      if (await stat(file).catch(() => null)) {
        this.known.set(sessionId, file)
        return file
      }
    }
    return null
  }

  /** Main transcripts touched at or after `sinceMs`. */
  async list(sinceMs: number): Promise<TranscriptFile[]> {
    const found: TranscriptFile[] = []
    await mapLimit(await this.dirs(), 16, async (dir) => {
      const entries = await readdir(join(this.root, dir), { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue
        const id = entry.name.slice(0, -".jsonl".length)
        if (!isSessionId(id)) continue
        const file = join(this.root, dir, entry.name)
        const info = await describe(file, id)
        if (info && info.mtimeMs >= sinceMs) {
          this.known.set(id, file)
          found.push(info)
        }
      }
    })
    return found
  }

  private async dirs(): Promise<readonly string[]> {
    const now = Date.now()
    if (this.projectDirs && now - this.projectDirs.at < PROJECT_LIST_TTL_MS) return this.projectDirs.dirs
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => [])
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    this.projectDirs = { at: now, dirs }
    return dirs
  }
}

export async function describe(file: string, id = basename(file, ".jsonl")): Promise<TranscriptFile | null> {
  const main = await stat(file).catch(() => null)
  if (!main?.isFile()) return null
  const subagents = await stat(subagentDir(file)).catch(() => null)
  const subMtime = subagents ? subagents.mtimeMs : 0
  return {
    id,
    file,
    version: `${main.size}:${Math.round(main.mtimeMs)}:${Math.round(subMtime)}`,
    mtimeMs: Math.max(main.mtimeMs, subMtime),
  }
}

/** Folds a session's main transcript and every subagent transcript beside it. */
export async function foldTranscript(file: string, id: string, signal?: AbortSignal): Promise<SessionFold> {
  const fold = new SessionFold(id)
  await readJsonl(file, (entry) => fold.add(entry), signal)
  const dir = subagentDir(file)
  const children = await readdir(dir).catch(() => [] as string[])
  for (const name of children.filter((child) => child.endsWith(".jsonl")).sort()) {
    fold.beginSubagent()
    await readJsonl(join(dir, name), (entry) => fold.add(entry, true), signal)
  }
  return fold
}

async function readJsonl(file: string, onEntry: (entry: unknown) => void, signal?: AbortSignal): Promise<void> {
  const stream = createReadStream(file, { encoding: "utf8" })
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY })
  try {
    for await (const line of lines) {
      if (signal?.aborted) break
      if (!line || line.charCodeAt(0) !== 123) continue
      let entry: unknown
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      onEntry(entry)
    }
  } finally {
    lines.close()
    stream.destroy()
  }
}

function subagentDir(file: string): string {
  return join(file.slice(0, -".jsonl".length), "subagents")
}

export async function mapLimit<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      if (item !== undefined) await task(item)
    }
  })
  await Promise.all(workers)
}
