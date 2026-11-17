import type { PluginViewContext } from "@qoder/plugin-api/view"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

globalThis.qoderPluginView.register({
  mount(container, context) {
    const root = createRoot(container)
    root.render(<Insights context={context} />)
    return { dispose: () => root.unmount() }
  },
})

function Insights({ context }: { readonly context: PluginViewContext }) {
  const [status, setStatus] = useState("…")
  useEffect(() => {
    context.api.node.callService("context", "ping").then(
      (reply) => setStatus(JSON.stringify(reply)),
      () => setStatus("node service unavailable"),
    )
  }, [context])
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>Context Insights</h1>
      <p>Plugin loaded · {context.locale} · {status}</p>
    </div>
  )
}
