import { rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const views = ["insights"]
const hostModules = [
  "@qoder-space/design-system",
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
]

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
      target: "chrome142",
      jsx: "automatic",
      legalComments: "none",
      external: hostModules,
    }),
  ),
])
