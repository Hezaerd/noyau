# Asking the human (questionnaire)

Use `noyau_ask_question` when you need structured decisions from the human during a Turn
(grilling rounds, design forks, confirmations with options).

## Rules

- One call per frontier round: pass every currently askable question together.
- Each question needs `id`, `prompt`, and at least two `options` (`id` + `label`).
- Put the recommended option first; append `(Recommended)` to its label.
- Set `allowMultiple: true` only when several options can be true at once.
- Do not invent an Other option — the Noyau UI always offers freeform Other.
- Optional `title` labels the round in the transcript.
- Wait for the tool result (`answers` keyed by question `id`) before the next round.
- Prefer this tool over freeform chat or Cursor-native AskQuestion when Noyau MCP is present.
