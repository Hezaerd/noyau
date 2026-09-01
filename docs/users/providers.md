# Manage and hand off providers

Settings → Providers lists every provider Noyau can use. A Thread can also move from one provider to another without moving its project or checkout.

## Hand off a Thread

1. Open the model picker in the composer.
2. Choose another provider, then choose one of its models.
3. Write what the new provider should do next and send the message.

The message starts the handoff. The Thread keeps its project, checkout, branch, file changes, and Noyau transcript. The previous provider session stops, and the new provider receives the prior transcript as handoff context. A provider and model transition appears above the handoff message in the transcript.

If the current provider is disabled or unavailable, the composer remains open so you can choose an available provider. Sending stays disabled until the selected provider is ready.

## Disable a provider

1. Open Settings → Providers.
2. Turn the switch off on Cursor, Claude Code, or Codex.
3. The row shows Disabled. That provider disappears from the available choices in the model picker.

A Thread that already uses a disabled provider still opens. Choose another available provider to hand it off, or turn the original provider back on.

## Point at a binary

Expand a row to set a binary path. Leave it empty to use the one on PATH. The change applies after you leave the field.

## Reverse or recover

To return a Thread to its previous provider, select that provider and model in the composer, then send the next message. This creates another handoff and keeps the same Thread history.

To re-enable a provider, turn its switch back on. Noyau probes it again and, when the handshake succeeds, it returns to the model picker.
