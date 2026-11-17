// Measures the data layer against real transcripts: overview scan (cold, warm from the disk cache,
// hot in-process), event-loop stalls while scanning, payload sizes, the largest session's detail
// fold, and dist bundle sizes. Usage: node scripts/bench.mjs [--root <projects dir>] [--runs 3]
import { appendFile, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build } from "esbuild"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? fallback : args[at + 1]
}
const work = await mkdtemp(join(tmpdir(), "qc-bench-"))
const entry = join(work, "entry.ts")
const bundle = join(work, "bench.mjs")
await import("node:fs/promises").then((fs) =>
  fs.writeFile(
    entry,
    [
      `export { OverviewIndex } from ${JSON.stringify(join(root, "src/node/overview.ts"))}`,
      `export { SessionDetails } from ${JSON.stringify(join(root, "src/node/session.ts"))}`,
      `export { TranscriptLocator, resolveProjectsRoot } from ${JSON.stringify(join(root, "src/node/transcripts.ts"))}`,
    ].join("\n"),
  ),
)
await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "error" })
const { OverviewIndex, SessionDetails, TranscriptLocator, resolveProjectsRoot } = await import(pathToFileURL(bundle).href)

const projects = option("root", resolveProjectsRoot("qoder"))
const runs = Number(option("runs", "3"))
const cacheFile = join(work, "overview-cache.json")
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
const ms = (value) => `${value.toFixed(0)} ms`

/** Runs `task` while sampling the event loop every 5 ms; reports wall time and the longest stall. */
async function timed(task) {
  let last = performance.now()
  let worst = 0
  const timer = setInterval(() => {
    const now = performance.now()
    worst = Math.max(worst, now - last - 5)
    last = now
  }, 5)
  const start = performance.now()
  const value = await task()
  const wall = performance.now() - start
  clearInterval(timer)
  worst = Math.max(worst, performance.now() - last - 5)
  return { value, wall, stall: Math.max(0, worst) }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const rows = []
const report = (label, results) =>
  rows.push([label, ms(median(results.map((r) => r.wall))), ms(median(results.map((r) => r.stall)))])

const cold = []
for (let run = 0; run < runs; run += 1) {
  await rm(cacheFile, { force: true })
  const index = new OverviewIndex(new TranscriptLocator(projects), cacheFile)
  cold.push(await timed(() => index.overview("7d")))
}
report("overview cold (no cache)", cold)

const warm = []
const hot = []
let overviews = {}
for (let run = 0; run < runs; run += 1) {
  const index = new OverviewIndex(new TranscriptLocator(projects), cacheFile)
  warm.push(await timed(() => index.overview("7d")))
  hot.push(await timed(() => index.overview("7d")))
  if (run === 0) for (const range of ["today", "7d", "30d"]) overviews[range] = await index.overview(range)
}
report("overview warm (disk cache)", warm)
report("overview hot (in memory)", hot)

const { value: cachedOverview } = cold[0]
const files = cachedOverview.scannedFiles
const cacheSize = (await stat(cacheFile)).size

// The biggest main transcript stands in for a long session.
const listed = await new TranscriptLocator(projects).list(0)
let largest = null
for (const transcript of listed) {
  const size = (await stat(transcript.file)).size
  if (!largest || size > largest.size) largest = { ...transcript, size }
}
const detailRuns = []
let detailPayload = 0
for (let run = 0; run < runs; run += 1) {
  const details = new SessionDetails(new TranscriptLocator(projects))
  const result = await timed(() => details.load(largest.id))
  detailPayload = JSON.stringify(result.value).length
  detailRuns.push(result)
}
report(`session detail fold (${kb(largest.size)} transcript)`, detailRuns)
const repeat = new SessionDetails(new TranscriptLocator(projects))
const first = await repeat.load(largest.id)
report("session detail unchanged poll", [await timed(() => repeat.load(largest.id, first.version))])

// A live session grows by an entry between polls: copy the largest transcript, poll, append one of
// its own lines, poll again.
const liveRoot = join(work, "live")
await mkdir(join(liveRoot, "-bench"), { recursive: true })
const liveFile = join(liveRoot, "-bench", `${largest.id}.jsonl`)
const appended = []
for (let run = 0; run < runs; run += 1) {
  await copyFile(largest.file, liveFile)
  const lines = (await readFile(liveFile, "utf8")).trimEnd().split("\n")
  const live = new SessionDetails(new TranscriptLocator(liveRoot))
  const before = await live.load(largest.id)
  await appendFile(liveFile, `${lines.at(-1)}\n`)
  appended.push(await timed(() => live.load(largest.id, before.version)))
}
report("session detail after a one-line append", appended)

const dist = join(root, "dist")
const bundles = []
for (const sub of ["node", "browser"]) {
  for (const name of await readdir(join(dist, sub)).catch(() => [])) bundles.push([`dist/${sub}/${name}`, (await stat(join(dist, sub, name))).size])
}

console.log(`Transcripts: ${projects} (${files} scanned, ${runs} runs, median)\n`)
console.log("| Measure | Wall | Longest event-loop stall |\n| --- | ---: | ---: |")
for (const [label, wall, stall] of rows) console.log(`| ${label} | ${wall} | ${stall} |`)
console.log("\n| Payload | Size |\n| --- | ---: |")
for (const range of Object.keys(overviews)) console.log(`| overview ${range} (${overviews[range].sessions.length} cards) | ${kb(JSON.stringify(overviews[range]).length)} |`)
console.log(`| session detail | ${kb(detailPayload)} |`)
console.log(`| overview-cache.json | ${kb(cacheSize)} |`)
if (bundles.length) {
  console.log("\n| Bundle | Size |\n| --- | ---: |")
  for (const [name, size] of bundles) console.log(`| ${name} | ${kb(size)} |`)
}
await rm(work, { recursive: true, force: true })
