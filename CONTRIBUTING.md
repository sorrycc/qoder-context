# Contributing

## Build

```sh
npm install
npm run check      # typecheck + unit tests + build
npm run build      # dist/node/main.cjs, dist/browser/{insights,session}.cjs
```

## Run in a local Qoder

Unpackaged (dev) Qoder loads unverified plugins from `QODER_APP_PLUGIN_DEV_DIRS` or from
`<config root>/app/dev-extensions/`:

```sh
scripts/dev.sh             # build, then start the dev Desktop from ~/Projects/qoder (QODER_DIR) with this plugin
scripts/dev.sh --cdp       # the same with CDP on port 9333; --packaged starts /Applications/Qoder.app
npm run link-dev           # symlink this repo into ~/.qoder/app/dev-extensions/context-insights
npm run unlink-dev
# or, without touching ~/.qoder:
QODER_APP_PLUGIN_DEV_DIRS=$PWD npm run dev   # from ~/Projects/qoder
```

The dev Desktop needs the Qoder checkout's dependencies current (`npm ci` under Node 22, as pinned
by its `engines`) and a sign-in in the dev window; the dev instance keeps its own sessions, so start a
conversation there to see the per-session view.

To inspect the dev window over the Chrome DevTools Protocol, start the desktop workspace directly
with a debugging port (from the Qoder checkout, under Node 22):

```sh
QODER_APP_PLUGIN_DEV_DIRS=~/Projects/qoder-context \
  npm run dev -w @qoder-space/desktop -- -- --remote-debugging-port=9333
```

The views render inside a shadow root, so reach `.qc-root` through the host element's `shadowRoot`.

A packaged Qoder only loads them when started with `QODER_APP_PLUGIN_ALLOW_UNVERIFIED=true`:

```sh
QODER_APP_PLUGIN_ALLOW_UNVERIFIED=true QODER_APP_PLUGIN_DEV_DIRS=$PWD \
  /Applications/Qoder.app/Contents/MacOS/Qoder
```

Then open **Context Insights** from the lower-left sidebar. In a conversation, open the Task
Monitor: the **Context** section lists this session's context usage; click it to open the view.

## Preview without Qoder

`scripts/preview.mjs` serves the built views in a plain browser page with a stand-in for the Qoder host, while the
plugin's node service runs for real against your transcripts or any other config folder:

```sh
npm run build
node scripts/preview.mjs                     # your own ~/.qoder transcripts
node scripts/demo-data.mjs /tmp/qc-demo      # or synthetic ones, so nothing private shows
node scripts/preview.mjs --config /tmp/qc-demo
```

Open `http://localhost:4790/insights`, or `/session?id=<sessionId>` for one conversation. Both take `?width=`,
`?theme=light` and `?lang=zh-CN`.

## Screenshots

The images in `docs/screenshots/` come from the preview on the demo data, in the dark theme at 2x: Context Insights at
1280 px wide and the session view at 960 px, with request #10 pinned in the trend. The demo data is seeded, so a fresh
capture shows the same sessions, dated relative to the day it runs.
