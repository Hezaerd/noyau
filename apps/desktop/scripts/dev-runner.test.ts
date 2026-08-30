import { describe, expect, it } from "@effect/vitest"

import {
  bindsServerPort,
  bindsWebPort,
  classifyListenError,
  createDevRunnerEnv,
  formatDevRunnerLine,
  parseDevRunnerArgs,
} from "./dev-runner.ts"

describe("dev runner", () => {
  it("defaults to the desktop stack", () => {
    expect(parseDevRunnerArgs([])).toEqual({
      mode: "dev",
      homeDir: undefined,
      port: undefined,
      dryRun: false,
    })
  })

  it("parses mode, home, port, and dry-run", () => {
    expect(
      parseDevRunnerArgs([
        "dev:server",
        "--home-dir",
        "/tmp/wt/.noyau",
        "--port",
        "4010",
        "--dry-run",
      ]),
    ).toEqual({
      mode: "dev:server",
      homeDir: "/tmp/wt/.noyau",
      port: 4010,
      dryRun: true,
    })
  })

  it("rejects an unknown mode or flag", () => {
    expect(() => parseDevRunnerArgs(["prod"])).toThrow(/Unknown mode/)
    expect(() => parseDevRunnerArgs(["--share"])).toThrow(/Unknown flag/)
    expect(() => parseDevRunnerArgs(["--port", "5173abc"])).toThrow(/--port must be an integer/)
  })

  it("treats a missing address family as free, not occupied", () => {
    expect(classifyListenError({ code: "EADDRINUSE" })).toBe("busy")
    expect(classifyListenError({ code: "EADDRNOTAVAIL" })).toBe("host-unavailable")
    expect(classifyListenError({ code: "EAFNOSUPPORT" })).toBe("host-unavailable")
    expect(classifyListenError({ code: "EPROTONOSUPPORT" })).toBe("host-unavailable")
    expect(classifyListenError({})).toBe("busy")
  })

  it("binds only the ports that mode will listen on", () => {
    expect(bindsWebPort("dev")).toBe(true)
    expect(bindsServerPort("dev", false)).toBe(false)
    expect(bindsServerPort("dev:server", false)).toBe(true)
    expect(bindsServerPort("dev:server", true)).toBe(false)
    expect(bindsWebPort("dev:server")).toBe(false)
    expect(bindsWebPort("dev:web")).toBe(true)
    expect(bindsServerPort("dev:web", false)).toBe(false)
  })

  it("wires Vite, Electron, and the standalone server from one pair", () => {
    const env = createDevRunnerEnv(
      { PATH: "/bin" },
      {
        serverPort: 3011,
        webPort: 5183,
        home: "/tmp/wt/.noyau",
      },
    )

    expect(env.PORT).toBe("5183")
    expect(env.NOYAU_PORT).toBe("3011")
    expect(env.VITE_DEV_SERVER_URL).toBe("http://127.0.0.1:5183/")
    expect(env.NOYAU_DEV_RENDERER_URL).toBe("http://127.0.0.1:5183/")
    expect(env.VITE_NOYAU_RPC_URL).toBe("ws://127.0.0.1:3011/rpc")
    expect(env.NOYAU_HOME).toBe("/tmp/wt/.noyau")
    expect(env.NOYAU_DATA_DIR).toBe("/tmp/wt/.noyau")
    expect(env.PATH).toBe("/bin")
  })

  it("prints the line AGENTS.md tells maintainers to read", () => {
    expect(
      formatDevRunnerLine("dev", "worktree /tmp/wt", 12, 13, 3014, 5186, "/tmp/wt/.noyau"),
    ).toBe(
      "[dev-runner] mode=dev source=worktree /tmp/wt selectedOffset=13 serverPort=3014 webPort=5186 baseDir=/tmp/wt/.noyau",
    )
    expect(formatDevRunnerLine("dev", "default ports", 0, 0, 3001, 5173, "/repo/.noyau")).toBe(
      "[dev-runner] mode=dev source=default ports serverPort=3001 webPort=5173 baseDir=/repo/.noyau",
    )
  })
})
