import type { Activate } from "@qoder/plugin-api"

export const activate: Activate = (context) => {
  context.subscriptions.push(
    context.api.node.registerService({
      name: "context",
      methods: {
        ping: () => ({ ok: true, product: context.product.id }),
      },
    }),
  )
}
