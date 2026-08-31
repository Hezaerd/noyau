# Change a keyboard shortcut

Settings → Keybindings lists every shortcut Noyau understands. You can change a binding in that list, or edit the keybindings file on disk.

## Change a shortcut in Settings

1. Open Settings → Keybindings.
2. Find the command. Search if the list is long.
3. Click the shortcut, then press the keys you want.
4. The new shortcut applies immediately.

## Edit the file

Noyau also reads a `keybindings.json` file next to your other environment files:

- Latest: `~/.noyau/latest/keybindings.json`
- Nightly: `~/.noyau/nightly/keybindings.json`

The file is a JSON array of rules. Each rule has a `key`, a `command`, and an optional `when` clause. Save the file and the app picks up the change without a restart.

If the file is missing or empty, Noyau uses the built-in shortcuts. If the JSON is invalid, Noyau keeps the last good shortcuts and ignores the broken save until you fix it.

## Reverse

Open Settings → Keybindings and restore the tab, or delete `keybindings.json` and let Noyau fall back to the defaults.
