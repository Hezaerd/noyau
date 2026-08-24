import * as NodeOs from "node:os"

import {
  extractEnvironmentValue,
  hydratePosixHome,
  hydratePosixPath,
  hydratePosixPathKnownDirs,
  hydrateWindowsPath,
  listLoginShellCandidates,
  mergePathEntries,
  readPathFromLaunchctl,
  readPathFromLoginShell,
  readPathFromWindowsUserEnvironment,
  resolveKnownPosixCliDirs,
  resolveKnownWindowsCliDirs,
  type ExecFileSyncLike,
} from "@noyau/server/host-path"
import { describe, expect, it } from "vite-plus/test"

const execFileFrom =
  (output: string): ExecFileSyncLike =>
  () =>
    output

const missingLaunchctl: ExecFileSyncLike = () => {
  throw new Error("spawn /bin/launchctl ENOENT")
}

const launchctlPath: ExecFileSyncLike = (file, args, options) => {
  expect(file).toBe("/bin/launchctl")
  expect(args).toEqual(["getenv", "PATH"])
  expect(options).toEqual({ encoding: "utf8", timeout: 2000 })
  return "  /opt/homebrew/bin:/usr/bin  \n"
}

const windowsUserPath: ExecFileSyncLike = (file, args) => {
  expect(file).toBe("pwsh.exe")
  expect(args[0]).toBe("-NoLogo")
  expect(args[1]).toBe("-NoProfile")
  expect(args[2]).toBe("-NonInteractive")
  expect(args[3]).toBe("-Command")
  expect(args[4]).toContain("[Environment]::GetEnvironmentVariable('PATH', 'Machine')")
  return "__NOYAU_ENV_PATH_START__\nC:\\Tools;C:\\Users\\me\\.local\\bin\n__NOYAU_ENV_PATH_END__\n"
}

const loginShellEmptyThenLaunchctl: ExecFileSyncLike = (file) =>
  file === "/bin/launchctl"
    ? "  /opt/homebrew/bin:/usr/bin  \n"
    : "__NOYAU_ENV_PATH_START__\n__NOYAU_ENV_PATH_END__\n"

describe("extractEnvironmentValue", () => {
  it("extracts the value between capture markers", () => {
    expect(
      extractEnvironmentValue(
        "__NOYAU_ENV_PATH_START__\n/opt/homebrew/bin:/usr/bin\n__NOYAU_ENV_PATH_END__\n",
        "PATH",
      ),
    ).toBe("/opt/homebrew/bin:/usr/bin")
  })

  it("ignores shell startup noise around the capture markers", () => {
    expect(
      extractEnvironmentValue(
        "Welcome to fish\n__NOYAU_ENV_PATH_START__\n/opt/homebrew/bin:/usr/bin\n__NOYAU_ENV_PATH_END__\nBye\n",
        "PATH",
      ),
    ).toBe("/opt/homebrew/bin:/usr/bin")
  })

  it("returns undefined when the markers are missing", () => {
    expect(extractEnvironmentValue("/opt/homebrew/bin /usr/bin", "PATH")).toBeUndefined()
  })
})

describe("readPathFromLoginShell", () => {
  it("uses a shell-agnostic printenv PATH probe", () => {
    const calls: Array<{
      readonly file: string
      readonly args: ReadonlyArray<string>
      readonly options: { encoding: "utf8"; timeout: number }
    }> = []
    const execFile: ExecFileSyncLike = (file, args, options) => {
      calls.push({ file, args, options })
      return "__NOYAU_ENV_PATH_START__\n/a:/b\n__NOYAU_ENV_PATH_END__\n"
    }

    expect(readPathFromLoginShell("/opt/homebrew/bin/fish", execFile)).toBe("/a:/b")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.file).toBe("/opt/homebrew/bin/fish")
    expect(calls[0]?.args).toHaveLength(2)
    expect(calls[0]?.args[0]).toBe("-ilc")
    expect(calls[0]?.args[1]).toContain("printenv PATH || true")
    expect(calls[0]?.args[1]).toContain("__NOYAU_ENV_PATH_START__")
    expect(calls[0]?.args[1]).toContain("__NOYAU_ENV_PATH_END__")
    expect(calls[0]?.options).toEqual({ encoding: "utf8", timeout: 5000 })
  })
})

describe("readPathFromLaunchctl", () => {
  it("returns a trimmed PATH value from launchctl", () => {
    expect(readPathFromLaunchctl(launchctlPath)).toBe("/opt/homebrew/bin:/usr/bin")
  })

  it("returns undefined when launchctl is unavailable", () => {
    expect(readPathFromLaunchctl(missingLaunchctl)).toBeUndefined()
  })
})

describe("readPathFromWindowsUserEnvironment", () => {
  it("reads Machine+User PATH from PowerShell", () => {
    expect(readPathFromWindowsUserEnvironment(windowsUserPath)).toBe(
      "C:\\Tools;C:\\Users\\me\\.local\\bin",
    )
  })

  it("falls back to powershell.exe when pwsh is missing", () => {
    const shells: Array<string> = []
    const execFile: ExecFileSyncLike = (file) => {
      shells.push(file)
      if (file === "pwsh.exe") {
        throw new Error("spawn pwsh.exe ENOENT")
      }
      return "__NOYAU_ENV_PATH_START__\nC:\\Windows\n__NOYAU_ENV_PATH_END__\n"
    }

    expect(readPathFromWindowsUserEnvironment(execFile)).toBe("C:\\Windows")
    expect(shells).toEqual(["pwsh.exe", "powershell.exe"])
  })
})

describe("listLoginShellCandidates", () => {
  it("returns env shell, user shell, then the platform fallback without duplicates", () => {
    expect(listLoginShellCandidates("darwin", " /opt/homebrew/bin/nu ", "/bin/zsh")).toEqual([
      "/opt/homebrew/bin/nu",
      "/bin/zsh",
    ])
  })

  it("falls back to the platform default when no shells are available", () => {
    expect(listLoginShellCandidates("linux", undefined, "")).toEqual(["/bin/bash"])
  })
})

describe("mergePathEntries", () => {
  it("prefers login-shell PATH entries and keeps inherited extras", () => {
    expect(
      mergePathEntries("/opt/homebrew/bin:/usr/bin", "/Users/test/.local/bin:/usr/bin", "darwin"),
    ).toBe("/opt/homebrew/bin:/usr/bin:/Users/test/.local/bin")
  })

  it("uses the platform-specific delimiter and ignores case on Windows", () => {
    expect(mergePathEntries("C:\\Tools;C:\\Windows", "C:\\windows;C:\\Git", "win32")).toBe(
      "C:\\Tools;C:\\Windows;C:\\Git",
    )
  })
})

describe("hydratePosixHome", () => {
  it("hydrates HOME for a blank environment from the user account", () => {
    const env: NodeJS.ProcessEnv = {}
    hydratePosixHome(env)
    expect(env.HOME).toBe(NodeOs.userInfo().homedir)
  })

  it("preserves an explicitly configured HOME", () => {
    const env: NodeJS.ProcessEnv = { HOME: "/custom/home" }
    hydratePosixHome(env, () => {
      throw new Error("HOME lookup should not run")
    })
    expect(env.HOME).toBe("/custom/home")
  })
})

describe("resolveKnownPosixCliDirs", () => {
  it("lists user-local and Homebrew CLI directories", () => {
    expect(resolveKnownPosixCliDirs({ HOME: "/Users/me" }, "darwin")).toEqual([
      "/Users/me/.local/bin",
      "/Users/me/.bun/bin",
      "/Users/me/.cargo/bin",
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ])
  })

  it("omits Homebrew on Linux", () => {
    expect(resolveKnownPosixCliDirs({ HOME: "/home/me" }, "linux")).toEqual([
      "/home/me/.local/bin",
      "/home/me/.bun/bin",
      "/home/me/.cargo/bin",
      "/usr/local/bin",
    ])
  })
})

describe("hydratePosixPathKnownDirs", () => {
  it("prepends known CLI dirs without spawning a shell", () => {
    const env: NodeJS.ProcessEnv = {
      HOME: "/Users/me",
      PATH: "/usr/bin:/usr/sbin",
    }
    hydratePosixPathKnownDirs(env, "darwin")
    expect(env.PATH).toBe(
      "/Users/me/.local/bin:/Users/me/.bun/bin:/Users/me/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/usr/sbin",
    )
  })
})

describe("hydratePosixPath", () => {
  it("writes the merged login-shell PATH onto the environment", () => {
    const env: NodeJS.ProcessEnv = {
      HOME: "/Users/me",
      SHELL: "/bin/zsh",
      PATH: "/usr/bin:/usr/sbin",
    }
    hydratePosixPath(
      env,
      "darwin",
      execFileFrom(
        "__NOYAU_ENV_PATH_START__\n/opt/homebrew/bin:/usr/bin:/Users/me/.local/bin\n__NOYAU_ENV_PATH_END__\n",
      ),
    )
    expect(env.PATH).toBe(
      "/opt/homebrew/bin:/usr/bin:/Users/me/.local/bin:/Users/me/.bun/bin:/Users/me/.cargo/bin:/usr/local/bin:/usr/sbin",
    )
  })

  it("falls back to launchctl on macOS when the login shell has no PATH", () => {
    const env: NodeJS.ProcessEnv = { SHELL: "/bin/zsh", PATH: "/usr/bin" }
    hydratePosixPath(env, "darwin", loginShellEmptyThenLaunchctl)
    expect(env.PATH).toBe("/opt/homebrew/bin:/usr/bin:/usr/local/bin")
  })
})

describe("hydrateWindowsPath", () => {
  it("prepends known CLI dirs and the User+Machine PATH", () => {
    const env: NodeJS.ProcessEnv = {
      PATH: "C:\\Windows\\System32",
      USERPROFILE: "C:\\Users\\me",
      LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
      APPDATA: "C:\\Users\\me\\AppData\\Roaming",
    }
    hydrateWindowsPath(
      env,
      execFileFrom(
        "__NOYAU_ENV_PATH_START__\nC:\\Tools;C:\\Windows\\System32\n__NOYAU_ENV_PATH_END__\n",
      ),
    )
    expect(env.PATH?.startsWith("C:\\Users\\me\\AppData\\Roaming\\npm;")).toBe(true)
    expect(env.PATH).toContain("C:\\Users\\me\\.local\\bin")
    expect(env.PATH).toContain("C:\\Tools")
    expect(env.PATH).toContain("C:\\Windows\\System32")
  })
})

describe("resolveKnownWindowsCliDirs", () => {
  it("lists user-local CLI directories used by Cursor and package managers", () => {
    expect(
      resolveKnownWindowsCliDirs({
        APPDATA: "C:\\Users\\me\\AppData\\Roaming",
        LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
        USERPROFILE: "C:\\Users\\me",
      }),
    ).toEqual([
      "C:\\Users\\me\\AppData\\Roaming\\npm",
      "C:\\Users\\me\\AppData\\Local\\Programs\\nodejs",
      "C:\\Users\\me\\AppData\\Local\\Volta\\bin",
      "C:\\Users\\me\\AppData\\Local\\pnpm",
      "C:\\Users\\me\\.local\\bin",
      "C:\\Users\\me\\.bun\\bin",
      "C:\\Users\\me\\scoop\\shims",
    ])
  })
})
