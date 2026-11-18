// Serves the built views in a plain browser page with a stand-in for the Qoder host, so they can be
// looked at and screenshotted without a Qoder build. The node service runs for real against
// QODER_CONFIG_DIR (or --config), e.g. the transcripts scripts/demo-data.mjs writes.
// Usage: node scripts/preview.mjs [--config <dir>] [--port 4790]
//   /insights                      Context Insights
//   /session?id=<sessionId>        one session's Context view
//   either takes ?width=<px> (default 1280 / 960), ?theme=light and ?lang=zh-CN
import { mkdtemp, readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const config = option("--config")
if (config) process.env.QODER_CONFIG_DIR = resolve(config)
const port = Number(option("--port") ?? 4790)

// A storage folder with no main.sqlite two levels up, so the context meter falls back to the estimate.
const storagePath = join(await mkdtemp(join(tmpdir(), "qoder-context-preview-")), "app-plugin-data", "context-insights")
let service = null
const { activate } = createRequire(import.meta.url)(join(root, "dist", "node", "main.cjs"))
await activate({
  plugin: { id: "community.context-insights", name: "context-insights", version: "preview" },
  extensionPath: root,
  storagePath,
  product: { id: "qoder" },
  diagnostics: { emit: (event) => console.warn(event.event, event.data ?? "") },
  subscriptions: [],
  api: {
    node: { registerService: (definition) => ((service = definition), { dispose() {} }) },
    sessionResources: { registerProvider: () => ({ dispose() {} }) },
  },
})

// React and a minimal Button / Input, exposed the way the host's module loader hands them out.
const { outputFiles } = await build({
  stdin: {
    contents: `
      import * as React from "react"
      import * as jsx from "react/jsx-runtime"
      import * as client from "react-dom/client"
      const Button = ({ variant = "secondary", size = "md", className = "", ...props }) =>
        React.createElement("button", { ...props, className: "ds-button ds-" + variant + " ds-" + size + " " + className })
      const Input = ({ className = "", ...props }) => React.createElement("input", { ...props, className: "ds-input " + className })
      window.__hostModules = {
        react: React,
        "react/jsx-runtime": jsx,
        "react/jsx-dev-runtime": jsx,
        "react-dom/client": client,
        "@qoder-space/design-system": { Button, Input },
      }`,
    resolveDir: root,
    loader: "jsx",
  },
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
})
const runtime = outputFiles[0].text

const PALETTES = {
  dark: { text: "#D9DCD9", surface: "#191B1A", line: "#363C37", input: "#252825" },
  light: { text: "#141414", surface: "#FFFFFF", line: "#E3E3E1", input: "#F9F9F9" },
}

function page(view, url) {
  const palette = PALETTES[url.searchParams.get("theme") === "light" ? "light" : "dark"]
  const width = Number(url.searchParams.get("width")) || (view === "insights" ? 1280 : 960)
  const context = {
    pluginId: "community.context-insights",
    viewId: view === "insights" ? "insights" : "session-context",
    sourceSessionId: url.searchParams.get("id"),
    locale: url.searchParams.get("lang") ?? "en",
  }
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${view} · preview</title>
<style>
  html, body { margin: 0; background: ${palette.surface}; color: ${palette.text}; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #view { width: ${width}px; min-height: 100vh; box-sizing: border-box; background: ${palette.surface}; color: ${palette.text}; }
  .ds-button { font: inherit; color: inherit; background: transparent; border: 1px solid ${palette.line}; border-radius: 6px; padding: 3px 10px; cursor: pointer; }
  .ds-primary { background: #4D9C61; border-color: #4D9C61; color: #fff; }
  .ds-ghost, .ds-text, .ds-tertiary { border-color: transparent; }
  .ds-sm { padding: 2px 8px; font-size: 12px; }
  .ds-input { font: inherit; color: inherit; background: ${palette.input}; border: 1px solid ${palette.line}; border-radius: 6px; padding: 4px 8px; outline: none; }
</style></head>
<body><div id="view"></div>
<script>${runtime}</script>
<script>
  const context = ${JSON.stringify(context)}
  context.api = {
    lifecycle: { isActive: () => true, onDidChangeActive: () => ({ dispose() {} }) },
    chat: { revealLocalSession: async (id) => { location.href = "/session?id=" + encodeURIComponent(id) + location.search.replace(/^\\?/, "&").replace(/&id=[^&]*/, "") } },
    node: {
      callService: async (_service, method, input = {}) => {
        const response = await fetch("/call/" + method, { method: "POST", body: JSON.stringify(input) })
        if (!response.ok) throw new Error(await response.text())
        return response.json()
      },
    },
  }
  globalThis.qoderPluginView = { register: (registration) => registration.mount(document.getElementById("view"), context) }
</script>
<script src="/dist/${view}.cjs"></script>
</body></html>`
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`)
  try {
    if (request.method === "POST" && url.pathname.startsWith("/call/")) {
      const method = service?.methods?.[url.pathname.slice("/call/".length)]
      if (!method) return send(response, 404, "text/plain", "no such method")
      let body = ""
      for await (const chunk of request) body += chunk
      return send(response, 200, "application/json", JSON.stringify(await method(JSON.parse(body || "{}"), {})))
    }
    const bundle = /^\/dist\/(insights|session)\.cjs$/.exec(url.pathname)
    if (bundle) {
      const code = await readFile(join(root, "dist", "browser", `${bundle[1]}.cjs`), "utf8")
      // The bundles are CommonJS that require their host modules; give them a module scope.
      const wrapped = `(function () { const module = { exports: {} }; const exports = module.exports;
        const require = (name) => { const found = window.__hostModules[name]; if (!found) throw new Error("no host module " + name); return found };
        ${code}
      })()`
      return send(response, 200, "text/javascript", wrapped)
    }
    if (url.pathname === "/insights" || url.pathname === "/") return send(response, 200, "text/html", page("insights", url))
    if (url.pathname === "/session") return send(response, 200, "text/html", page("session", url))
    send(response, 404, "text/plain", "not found")
  } catch (error) {
    send(response, 500, "text/plain", String(error?.stack ?? error))
  }
}).listen(port, () => {
  console.log(`Preview on http://localhost:${port}/insights (transcripts from ${process.env.QODER_CONFIG_DIR ?? "~/.qoder"})`)
})

function send(response, status, type, body) {
  response.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" })
  response.end(body)
}
