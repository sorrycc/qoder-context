import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = new Set(process.argv.slice(2))
const configRoot = process.env.QODER_CONFIG_DIR
  ? resolve(process.env.QODER_CONFIG_DIR)
  : join(homedir(), args.has("--cn") ? ".qoder-cn" : ".qoder")
const linkPath = join(configRoot, "app", "dev-extensions", "context-insights")

const existing = await lstat(linkPath).catch(() => null)
if (existing && !existing.isSymbolicLink()) {
  console.error(`${linkPath} exists and is not a symlink; refusing to touch it.`)
  process.exit(1)
}

if (args.has("--remove")) {
  if (existing) await rm(linkPath)
  console.log(`Removed ${linkPath}`)
  process.exit(0)
}

if (existing) {
  if ((await readlink(linkPath)) === root) {
    console.log(`Already linked: ${linkPath} -> ${root}`)
    process.exit(0)
  }
  await rm(linkPath)
}
await mkdir(dirname(linkPath), { recursive: true })
await symlink(root, linkPath, "dir")
console.log(`Linked ${linkPath} -> ${root}`)
console.log("Restart Qoder to load it (packaged builds also need QODER_APP_PLUGIN_ALLOW_UNVERIFIED=true).")
