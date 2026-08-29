export const shouldBlinkTerminalCursor = (
  focused: boolean,
  cursorBlinking: boolean,
  cursorVisible: boolean,
  reducedMotion: boolean,
): boolean => focused && cursorBlinking && cursorVisible && !reducedMotion
