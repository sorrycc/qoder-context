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

/** Ships styles.ts's STYLES template minified; esbuild's JS minifier leaves template text alone. */
const minifyStyles = {
  name: "minify-styles",
  setup(builder) {
    builder.onLoad({ filter: /[\\/]src[\\/]browser[\\/]styles\.ts$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8")
      const match = /export const STYLES = `([^`]*)`/.exec(source)
      if (!match || match[1].includes("${")) throw new Error("styles.ts: expected one plain STYLES template literal")
      const { code } = await transform(match[1], { loader: "css", minify: true, target: browserTarget })
      return { contents: `export const STYLES = ${JSON.stringify(code.trim())}`, loader: "ts" }
    })
  },
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
  ...views.map((name) =>
    build({
      entryPoints: [join(root, "src", "browser", `${name}.tsx`)],
      outfile: join(root, "dist", "browser", `${name}.cjs`),
      bundle: true,
      platform: "browser",
      format: "cjs",
      target: browserTarget,
      jsx: "automatic",
      legalComments: "none",
      minify: true,
      external: hostModules,
      plugins: [minifyStyles],
    }),
  ),
])
