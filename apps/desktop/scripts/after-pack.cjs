"use strict"

const { spawnSync } = require("node:child_process")
const path = require("node:path")

// electron-builder afterPack: sign the .app before the DMG is built.
// identity: null skips Developer ID; the leftover Electron linker signature
// does not seal Resources and Gatekeeper treats the nightly as corrupted.
module.exports = function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "adhoc-sign-mac.ts"), "--app", appPath],
    {
      stdio: "inherit",
    },
  )
  if (result.status !== 0) {
    throw new Error(`Ad-hoc sign failed for ${appPath}`)
  }
}
