---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round. Then wait for the user's answers before the next round.

## How to ask

Prefer tools in this order:

1. **`noyau_ask_question`** (Noyau MCP) when available — portable across Cursor / Codex / Claude Code Turns inside Noyau.
2. **AskQuestion** (Cursor native) when Noyau MCP is not in the toolkit.
3. Otherwise format each question like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

When using `noyau_ask_question` or AskQuestion: one call for the whole frontier; don't also paste those questions in chat. Each question needs at least two options; put your recommended option first and append `(Recommended)` to its label. Use `allowMultiple` / `allow_multiple` only when several answers can be true at once. The UI always offers Other for a custom answer — do not invent an Other option in the payload.

Example `noyau_ask_question` shape:

- title: optional round label
- questions: `[{ id, prompt, options: [{ id, label }], allowMultiple? }]`

Example prompts:

- "Where does durability live?" with options like ["SQL store + outbox (Recommended)", "In-memory Queue"]
- "Who owns the worktree?" with options like ["Attempt (Recommended)", "Execution", "AgentRun"]

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it — don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report — ask the rest of the frontier now. The _decisions_ are the user's — put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
