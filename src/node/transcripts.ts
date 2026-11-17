import { open, readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import { SessionFold } from "./fold.js"

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/
const PROJECT_LIST_TTL_MS = 30_000
const READ_CHUNK = 256 * 1024
/** Bytes kept from just before a read mark, to tell an appended file from a rewritten one. */
const MARK_TAIL = 64
const NEWLINE = 0x0a
const OPEN_BRACE = 0x7b

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

interface Listing {
  readonly mtimeMs: number
  readonly ids: readonly string[]
  readonly folders: ReadonlySet<string>
}

export class TranscriptLocator {
  private projectDirs: { readonly at: number; readonly dirs: readonly string[] } | null = null
  private readonly known = new Map<string, string>()
  /** Each project folder's transcript names, valid while the folder's mtime stays put. */
  private listings = new Map<string, Listing>()

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
    const listings = new Map<string, Listing>()
    await mapLimit(await this.dirs(), 16, async (dir) => {
      const listing = await this.listing(dir)
      if (!listing) return
      listings.set(dir, listing)
      await Promise.all(
        listing.ids.map(async (id) => {
          const file = join(this.root, dir, `${id}.jsonl`)
          const info = await describe(file, id, listing.folders.has(id))
          if (info && info.mtimeMs >= sinceMs) {
            this.known.set(id, file)
            found.push(info)
          }
        }),
      )
    })
    this.listings = listings
    return found
  }

  /**
   * A folder's session IDs and subfolders. Adding or removing an entry moves the folder's mtime, so
   * an unchanged folder costs a stat instead of a readdir; with hundreds of project folders that is
   * most of a refresh.
   */
  private async listing(dir: string): Promise<Listing | null> {
    const path = join(this.root, dir)
    const info = await stat(path).catch(() => null)
    if (!info) return null
    const cached = this.listings.get(dir)
    if (cached?.mtimeMs === info.mtimeMs) return cached
    const entries = await readdir(path, { withFileTypes: true }).catch(() => null)
    if (!entries) return null
    const ids: string[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue
      const id = entry.name.slice(0, -".jsonl".length)
      if (isSessionId(id)) ids.push(id)
    }
    // A session's subagent folder sits beside its transcript; without one there's nothing to stat.
    const folders = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name))
    return { mtimeMs: info.mtimeMs, ids, folders }
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

export async function describe(file: string, id = basename(file, ".jsonl"), hasFolder = true): Promise<TranscriptFile | null> {
  const main = await stat(file).catch(() => null)
  if (!main?.isFile()) return null
  const subagents = hasFolder ? await stat(subagentDir(file)).catch(() => null) : null
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
  await readJsonl(file, (entry) => fold.add(entry), START, signal)
  for (const child of await subagentFiles(file)) {
    fold.beginSubagent()
    await readJsonl(child, (entry) => fold.add(entry, true), START, signal)
  }
  return fold
}

/** Subagent transcripts beside `file`, in the order a fold reads them. */
export async function subagentFiles(file: string): Promise<string[]> {
  const dir = subagentDir(file)
  const children = await readdir(dir).catch(() => [] as string[])
  return children
    .filter((child) => child.endsWith(".jsonl"))
    .sort()
    .map((child) => join(dir, child))
}

/** How far a JSONL file has been read: the byte after the last entry taken, and the bytes before it. */
export interface ReadMark {
  readonly offset: number
  readonly tail: Buffer
}

export const START: ReadMark = { offset: 0, tail: Buffer.alloc(0) }

/**
 * Feeds each JSON line of `file` from `from` on to `onEntry` and returns where it stopped: after the
 * last complete line, or after a final unterminated line only when that already parses (a half-written
 * line is picked up whole next time). Returns null when the bytes before `from` no longer match, i.e.
 * the file was rewritten rather than appended to. Reads in chunks, so a large file never blocks the
 * event loop for long.
 */
export async function readJsonl(
  file: string,
  onEntry: (entry: unknown) => void,
  from: ReadMark = START,
  signal?: AbortSignal,
): Promise<ReadMark | null> {
  const handle = await open(file, "r")
  try {
    if (from.tail.length > 0) {
      const check = Buffer.alloc(from.tail.length)
      const { bytesRead } = await handle.read(check, 0, check.length, from.offset - check.length)
      if (bytesRead !== check.length || !check.equals(from.tail)) return null
    }
    const chunk = Buffer.allocUnsafe(READ_CHUNK)
    let position = from.offset
    let consumed = from.offset
    let partial: Buffer[] = []
    while (!signal?.aborted) {
      const { bytesRead } = await handle.read(chunk, 0, READ_CHUNK, position)
      if (bytesRead === 0) break
      const view = chunk.subarray(0, bytesRead)
      let cursor = 0
      for (let end = view.indexOf(NEWLINE); end !== -1; end = view.indexOf(NEWLINE, cursor)) {
        const piece = view.subarray(cursor, end)
        emitLine(partial.length > 0 ? Buffer.concat([...partial, piece]) : piece, onEntry)
        partial = []
        cursor = end + 1
      }
      if (cursor > 0) consumed = position + cursor
      // The chunk buffer is reused, so a carried-over line needs its own copy.
      if (cursor < bytesRead) partial.push(Buffer.from(view.subarray(cursor)))
      position += bytesRead
    }
    if (partial.length > 0 && !signal?.aborted && emitLine(Buffer.concat(partial), onEntry)) consumed = position
    const tail = Buffer.alloc(Math.min(MARK_TAIL, consumed))
    if (tail.length > 0) await handle.read(tail, 0, tail.length, consumed - tail.length)
    return { offset: consumed, tail }
  } finally {
    await handle.close()
  }
}

/** Parses one line when it looks like a JSON object; true when it was taken. */
function emitLine(line: Buffer, onEntry: (entry: unknown) => void): boolean {
  if (line.length === 0 || line[0] !== OPEN_BRACE) return false
  let entry: unknown
  try {
    entry = JSON.parse(line.toString("utf8"))
  } catch {
    return false
  }
  onEntry(entry)
  return true
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
