import * as NodeFS from "node:fs"
import * as NodePath from "node:path"
import * as NodeURL from "node:url"

const desktopDirectory = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
)
const webDistributionDirectory = NodePath.resolve(desktopDirectory, "../web/dist")
const rendererDistributionDirectory = NodePath.resolve(desktopDirectory, "dist-electron/renderer")

if (!NodeFS.existsSync(NodePath.join(webDistributionDirectory, "index.html"))) {
  throw new Error(`Web renderer build not found at ${webDistributionDirectory}`)
}

NodeFS.rmSync(rendererDistributionDirectory, { recursive: true, force: true })
NodeFS.cpSync(webDistributionDirectory, rendererDistributionDirectory, { recursive: true })
