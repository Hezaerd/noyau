type TtyInput = {
  readonly isTTY?: boolean
  readonly setRawMode?: (mode: boolean) => void
}

type TtyOutput = {
  readonly isTTY?: boolean
  readonly write: (chunk: string) => boolean | undefined
}

// Souris, alternate screen, bracketed paste, cursor keys, curseur visible.
export const TTY_RESTORE_SEQUENCE =
  "\u001B[?1000l\u001B[?1002l\u001B[?1003l\u001B[?1006l\u001B[?1015l\u001B[?1007l\u001B[?1l\u001B[?1049l\u001B[?2004l\u001B[?25h\u001B[0m"

const restoreRawMode = (stdin: TtyInput) => {
  if (!stdin.isTTY || stdin.setRawMode === undefined) {
    return
  }
  try {
    stdin.setRawMode(false)
  } catch {
    // Le fd n'est plus un TTY, ou Node l'a déjà remis en cooked.
  }
}

const writeRestore = (stream: TtyOutput) => {
  if (!stream.isTTY) {
    return
  }
  stream.write(TTY_RESTORE_SEQUENCE)
}

export const restoreTty = (
  stdin: TtyInput = process.stdin,
  stdout: TtyOutput = process.stdout,
  stderr: TtyOutput = process.stderr,
) => {
  restoreRawMode(stdin)
  writeRestore(stdout)
  if (stderr !== stdout) {
    writeRestore(stderr)
  }
}
