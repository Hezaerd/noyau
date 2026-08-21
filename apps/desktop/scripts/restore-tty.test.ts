import { describe, expect, it } from "@effect/vitest"

import { restoreTty, TTY_RESTORE_SEQUENCE } from "./restore-tty.ts"

const disableMouseModes = ["?1000l", "?1002l", "?1003l", "?1006l"] as const
const disableSessionModes = ["?1049l", "?2004l", "?1l"] as const

describe("restoreTty", () => {
  it("disables leftover mouse, alternate-screen, and keypad modes", () => {
    for (const mode of [...disableMouseModes, ...disableSessionModes]) {
      expect(TTY_RESTORE_SEQUENCE.includes(mode)).toBe(true)
    }
  })

  it("writes the restore sequence on TTY stdout and stderr", () => {
    const written: Array<string> = []
    restoreTty(
      { isTTY: false },
      {
        isTTY: true,
        write: (chunk) => {
          written.push(`out:${chunk}`)
        },
      },
      {
        isTTY: true,
        write: (chunk) => {
          written.push(`err:${chunk}`)
        },
      },
    )

    expect(written).toEqual([`out:${TTY_RESTORE_SEQUENCE}`, `err:${TTY_RESTORE_SEQUENCE}`])
  })

  it("leaves non-TTY streams untouched and cooks a TTY stdin", () => {
    const modes: Array<boolean> = []
    const written: Array<string> = []
    restoreTty(
      {
        isTTY: true,
        setRawMode: (mode) => {
          modes.push(mode)
        },
      },
      {
        isTTY: false,
        write: (chunk) => {
          written.push(chunk)
        },
      },
      {
        isTTY: false,
        write: (chunk) => {
          written.push(chunk)
        },
      },
    )

    expect(modes).toEqual([false])
    expect(written).toEqual([])
  })
})
