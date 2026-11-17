import { readFile, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { build, transform } from "esbuild"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const views = ["insights", "session"]
const hostModules = [
  "@qoder-space/design-system",
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
]

const browserTarget = "chrome142"

/**
 * Ships styles.ts's STYLES template minified, without the rules marked for the other view;
 * esbuild's JS minifier leaves template text alone.
 */
const minifyStyles = (view) => ({
  name: "minify-styles",
  setup(builder) {
    builder.onLoad({ filter: /[\\/]src[\\/]browser[\\/]styles\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8")
      const match = /export const STYLES = `([^`]*)`/.exec(source)
      if (!match || match[1].includes("${")) throw new Error("styles.ts: expected one plain STYLES template literal")
      const css = match[1].replace(/\/\* @view (\w+) \*\/([\s\S]*?)\/\* @end \*\//g, (_, only, rules) => (only === view ? rules : ""))
      if (css.includes("@view") || css.includes("@end")) throw new Error("styles.ts: unbalanced @view / @end markers")
      const { code } = await transform(css, { loader: "css", minify: true, target: browserTarget })
      return { contents: `export const STYLES = ${JSON.stringify(code.trim())}`, loader: "ts" }
    })
  },
})

const isMessagesStart = (line) => /^const (en|zh)\b.* = \{$/.test(line)

/** i18n.ts split into its message entries ({ key, lines }) and the code around them. */
function splitMessages(source) {
  const lines = source.split("\n")
  const parts = []
  let inMessages = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (isMessagesStart(line)) inMessages = true
    else if (line === "}") inMessages = false
    const entry = inMessages ? /^  (\w+): /.exec(line) : null
    const start = index
    if (entry && line.endsWith("{")) while (lines[index] !== "  },") index++
    parts.push({ key: entry?.[1], lines: lines.slice(start, index + 1) })
  }
  return parts
}

/**
 * Drops messages a view never names from i18n.ts. A key counts as used when it appears as a
 * string literal in the view's sources, i18n.ts's own helpers included (MessageKey keeps keys
 * literal). Entries are one `key: …,` line, or a `key: {` … `},` block for plurals.
 */
const pruneMessages = (used) => ({
  name: "prune-messages",
  setup(builder) {
    builder.onLoad({ filter: /[\\/]src[\\/]browser[\\/]i18n\.ts$/ }, async ({ path }) => {
      const parts = splitMessages(await readFile(path, "utf8"))
      const contents = parts.flatMap((part) => (part.key === undefined || used.has(part.key) ? part.lines : [])).join("\n")
      return { contents, loader: "ts" }
    })
  },
})

const viewOptions = (name) => ({
  entryPoints: [join(root, "src", "browser", `${name}.tsx`)],
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: browserTarget,
  jsx: "automatic",
  legalComments: "none",
  minify: true,
  external: hostModules,
})

/** Every string literal in the view's sources (i18n.ts outside its messages), from a dry build's input list. */
async function literalsOf(name) {
  const { metafile } = await build({ ...viewOptions(name), write: false, metafile: true, logLevel: "silent" })
  const used = new Set()
  for (const input of Object.keys(metafile.inputs)) {
    if (!input.startsWith("src/")) continue
    let source = await readFile(join(root, input), "utf8")
    if (input.endsWith("i18n.ts")) source = splitMessages(source).flatMap((part) => (part.key === undefined ? part.lines : [])).join("\n")
    else if (/as MessageKey\b/.test(source)) throw new Error(`${input}: a cast to MessageKey hides the key from message pruning`)
    for (const [, literal] of source.matchAll(/["'`](\w+)["'`]/g)) used.add(literal)
  }
  return used
}

await rm(join(root, "dist"), { recursive: true, force: true })

await Promise.all([
  build({
    entryPoints: [join(root, "src", "node", "main.ts")],
    outfile: join(root, "dist", "node", "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    legalComments: "none",
  }),
  ...views.map(async (name) =>
    build({
      ...viewOptions(name),
      outfile: join(root, "dist", "browser", `${name}.cjs`),
      plugins: [minifyStyles(name), pruneMessages(await literalsOf(name))],
    }),
  ),
])
