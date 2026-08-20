import * as NodeFS from "node:fs"
import * as NodePath from "node:path"
import * as NodeURL from "node:url"

const desktopDirectory = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
)
const serverBundle = NodePath.resolve(desktopDirectory, "../server/dist/main.mjs")
const targetDirectory = NodePath.join(desktopDirectory, "dist-electron", "server")

NodeFS.mkdirSync(targetDirectory, { recursive: true })
NodeFS.copyFileSync(serverBundle, NodePath.join(targetDirectory, "main.mjs"))
