import { SessionFold } from "./fold.js"
import { agentIdOf, beginSubagent, readJsonl, START, subagentFiles, type ReadMark, type TranscriptFile } from "./transcripts.js"

const DEFAULT_LIMIT = 6

interface Tracked {
  readonly version: string
  readonly fold: SessionFold
  /** Read marks for the main transcript and each subagent transcript, in fold order. */
  readonly marks: ReadonlyMap<string, ReadMark>
}

/**
 * Keeps the folds of recently read transcripts with how far each file was read. Transcripts are
 * append-only, so a newer version only reads the bytes added since; a file that shrank, was
 * rewritten or lost a subagent transcript is folded again from the start. Shared by the overview and
 * the session view, so an active session is parsed once however many callers poll it.
 */
export class FoldCache {
  private readonly entries = new Map<string, Promise<Tracked>>()

  constructor(private readonly limit = DEFAULT_LIMIT) {}

  /**
   * Runs `read` on the fold of `transcript` at (at least) its version. Calls for one file are
   * serialized, so `read` never sees a fold that is half-way through an update.
   */
  async use<T>(transcript: TranscriptFile, read: (fold: SessionFold) => T): Promise<T> {
    const previous = this.entries.get(transcript.file)
    let result: T | undefined
    const next = (async () => {
      const prior = await previous?.catch(() => undefined)
      const tracked = prior?.version === transcript.version ? prior : ((prior && (await resume(prior, transcript))) ?? (await fresh(transcript)))
      result = read(tracked.fold)
      return tracked
    })()
    this.entries.delete(transcript.file)
    this.entries.set(transcript.file, next)
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!)
    await next
    return result as T
  }
}

async function fresh(transcript: TranscriptFile): Promise<Tracked> {
  const fold = new SessionFold(transcript.id)
  const marks = new Map<string, ReadMark>()
  const main = await readJsonl(transcript.file, (entry) => fold.add(entry))
  if (main) marks.set(transcript.file, main)
  for (const child of await subagentFiles(transcript.file)) {
    await beginSubagent(fold, child)
    const mark = await readJsonl(child, (entry) => fold.add(entry, true))
    if (mark) marks.set(child, mark)
  }
  return { version: transcript.version, fold, marks }
}

/** Continues `prior` with what was appended to each file, or null when it has to start over. */
async function resume(prior: Tracked, transcript: TranscriptFile): Promise<Tracked | null> {
  const children = await subagentFiles(transcript.file)
  const known = new Set([transcript.file, ...children])
  for (const file of prior.marks.keys()) if (!known.has(file)) return null
  // A resume that bails out part-way has already changed the fold; the fresh fold replaces it.
  const fold = prior.fold
  const marks = new Map(prior.marks)
  const main = await readJsonl(transcript.file, (entry) => fold.add(entry), marks.get(transcript.file) ?? START)
  if (!main) return null
  marks.set(transcript.file, main)
  for (const child of children) {
    const from = marks.get(child)
    // Appended entries need to be credited to the agent they belong to, not the last one started.
    if (!from) await beginSubagent(fold, child)
    else fold.resumeSubagent(agentIdOf(child))
    const mark = await readJsonl(child, (entry) => fold.add(entry, true), from ?? START)
    if (!mark) return null
    marks.set(child, mark)
  }
  return { version: transcript.version, fold, marks }
}
