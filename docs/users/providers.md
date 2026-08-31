# Turn a provider on or off

Settings → Providers lists every provider Noyau can start a Thread with. A switch on each row turns that provider on or off without reconnecting.

## Disable a provider

1. Open Settings → Providers.
2. Turn the switch off on Cursor, Claude Code, or Codex.
3. The row shows Disabled. That provider disappears from the model picker on a new Thread.

A Thread that already uses a disabled provider still opens. The composer stays locked so you cannot start another turn on it. Turn the switch back on to use it again.

## Point at a binary

Expand a row to set a binary path. Leave it empty to use the one on PATH. The change applies after you leave the field.

## Reverse

Turn the same switch back on. Noyau probes that provider again and, when the handshake succeeds, it returns to the model picker.
