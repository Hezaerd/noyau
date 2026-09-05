import {
  readPathFromLoginShell,
  readPathFromWindowsUserEnvironment,
  readPathFromLaunchctl,
  type ExecFileSyncLike,
} from "@noyau/server/host-path"
import { describe, expect, it } from "vite-plus/test"

describe("host PATH subprocesses", () => {
  it("hides every environment probe on Windows", () => {
    const options: Array<Parameters<ExecFileSyncLike>[2]> = []
    const execFile: ExecFileSyncLike = (_file, _args, receivedOptions) => {
      options.push(receivedOptions)
      return "__NOYAU_ENV_PATH_START__\nC:\\Tools\n__NOYAU_ENV_PATH_END__\n"
    }

    expect(readPathFromWindowsUserEnvironment(execFile)).toBe("C:\\Tools")
    expect(options).toHaveLength(1)
    expect(options[0]?.windowsHide).toBe(true)
  })

  it("also hides the cross-platform login-shell probes", () => {
    const options: Array<Parameters<ExecFileSyncLike>[2]> = []
    const execFile: ExecFileSyncLike = (_file, _args, receivedOptions) => {
      options.push(receivedOptions)
      return "__NOYAU_ENV_PATH_START__\n/usr/local/bin\n__NOYAU_ENV_PATH_END__\n"
    }

    expect(readPathFromLoginShell("/bin/zsh", execFile)).toBe("/usr/local/bin")
    expect(readPathFromLaunchctl(execFile)).toContain("__NOYAU_ENV_PATH_START__")
    expect(options).toHaveLength(2)
    expect(options.every((option) => option.windowsHide)).toBe(true)
  })
})
