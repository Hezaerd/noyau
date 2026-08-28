# Noyau

Noyau is an ADE "Agentic Development Environment", think of it as a GUI for coding agents "bring-your-own-subscription" alternative to apps like Claude Desktop, Codex App, Cursor Glass and Conductor.
A Node WebSocket server wraps provider CLIs (Codex, Claude Code, Cursor) and serves web and desktop clients.

## A small glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing Noyau.
- **we, us and maintainers** means Hezaerd and the people building Noyau. These are who you are talking to now.
- **user** means the person using Noyau to direct coding agents.
- **agent** means the coding agent a user runs inside Noyau. Depending of context, that may also include you.
- **provider** means the agent runtime or harness Noyau talks to, such as Codex, Claude Code, Cursor, etc.
- **client** means the web or desktop UI.
- **environment** means one running Noyau server and the machine, filesystem, provider credentials, and state it owns.
- **project** means an environment-local workspace record rooted at a directory.
- **thread** means the durable conversation and work history for a project.
- **turn** means one user-to-agent cycle, including follow-up work such as checkpointing.
- **board** means a project's unique Kanban surface: ordered columns that hold its tickets.
- **ticket** means a durable, flat unit of work on a project's board.
- **Noyau home** means the base data directory. Runtime state normally lives below its userdata directory.

## The two ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or `kill` a PID you found by matching a name, path or worktree string. Your own agent process has this worktree's path in its argv, and this machine run several other dev servers at once. Kill only a PID you captured at spawn, or the owner of your port from `ss -H -ltnp` after confirming `/proc/<pid>/cwd` is your worktree.
2. **Writing to the live install.** `~/.noyau/userdata` is the developer's real Noyau database, in use while you work. Reading it and copying from it are fine, and a good way to get real test data (see Test data). Never start a server against it, never open it read-write, never clean it up.

## Hit every surface

The most common defect in this repo is a change that works on the path you tested and is missing everywhere else. Before calling frontend work done, walk this list and say which entries applied:

- **Entry points.** A behavior reachable from the chat view is usually also reachable from Settings, the command palette, and a keybinding. Fixing one is not fixing the feature.
- **Clients.** Web and desktop (wraps web, adds Electron shell/IPC). Shared logic lives in `packages/client-runtime`.
- **Providers.** Codex, Claude, Cursor, Grok, and OpenCode each have an adapter. Provider-shaped features need a decision per adapter, even if the decision is "not supported here".
- **Contracts.** Anything crossing the wire is typed in `packages/contracts`. Change the schema and the server, web, and desktop all follow.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Settle need unsettle. Close needs reopen. A one-way door is a bug.
- **Docs.** `docs/` splits by audience. Behavior changes that a user would notice belong in `docs/users/` (shipped-product voice, no repo tooling or source paths); architecture and contributor changes in `docs/internals`; runbooks in `docs/operations/`; new vocabulary in `docs/internals/glossary.md`. Writing or updating those pages: `.agents/skills/write-docs`.

## Dev servers

- `vp i` installs. Worktrees get this from the `noyau.json` setup scripts; if module resolution looks broken, it probably did not run.
- `vp run dev` starts server and web. In a worktree, state defaults to that worktree's gitignored `.noyau`, which deliberately outranks an ambient `NOYAU_HOME` so you cannot land on shared state by accident. An explicit `--home-dir` still wins.
- Ports derive from the worktree path and are stable across restarts, but read the real ones from the `[dev-runner]` line since occupied ports shift.
- Stop what you started, by the PID you tracked. See rule 1.

## Test data

An empty database is a bad test. Seed your worktree's `.noyau` with a copy of real data instead of pointing at live state:

- Copy from `~/.noyau/userdata` (the developer's real data, the most realistic test set) or `~/.noyau/dev`. Worktree state lives at `<worktree>/.noyau/userdata`.
- Snapshot the database with `VACUUM INTO`, which is safe even while a server has the source open and yields one consistent file:

```bash
 mkdir -p .noyau/userdata
 rm -f .noyau/userdata/state.sqlite*  # VACUUM INTO refuses to overwrite
 bun -e "new (require('bun:sqlite').Database)(process.env.HOME + '/.noyau/userdata/state.sqlite', { readonly: true }).run(\"VACUUM INTO '.noyau/userdata/state.sqlite'\")"
```

    A plain `cp` is only safe when no server has the source open, and must bring the `-wal` and `-shm` siblings along. A live file copy is a corrupt copy.

- Bring `secrets` and `settings.json` only if the flow under test needs them.
- Copy in, never symlink. Data flows one way: into your sandbox, never back out.

## Verifying

- Smallest proof that the change works. `vp test run <files>` for the tests you touched, targeted lint and typecheck for the scope you changed.
- **Do not run repo-wide checks.** No `vp check`, no `vp run -r typecheck` unless I ask. CI owns the big picture.
- Backend behaviour changes ship with focused tests for that behavior.
- The server is event-sourced and it's async flows emit typed receipts. Wait a receipts and worker drains, never on sleep or polling. A test that need a timeout to pass is wrong and is a bug.
- Upon request, user-visible frontend changes should get one integrated pass with a real client. The primary agent does this once after integrating. Subagents do not launch their own dev servers. Ask permission before doing computer use or spinning up browsers.

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before/after images. Motion or timing needs a short video.
- Upload PR evidence to GitHub. Never commit PR-only screenshots or assets such as `.github/pr-assets/`.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## Plans and work artifacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep temporary working material outside the worktree. `.plans/` is gitignored only as a safety net for legacy tooling.
- Track active maintainer work in the GitHub issue or project item that owns it.
- Put durable architecture, constraints, and decisions in `docs/internals/`. Update those docs when the product changes so agents find current facts instead of abandoned intentions.
- A merged PR is the implementation record. Close or update its tracking item when the work lands; do not preserve a second checklist in the repository.

## How it works

Clients send typed WebSocket requests. The server turns them into _commands_, a pure _decider_ turns commands into persisted _events_, and a _projector_ derives the read model the UI renders. Provider CLIs run as subprocesses; per-provider _adapters_ translate their native protocols into orchestration events. Side effects run in queue-backed _reactors_ that emit _receipts_ when milestones land. Each turn ends with a _checkpoint_, a hidden git ref, so the app can diff and restore.

Full glossary with file links: `docs/internals/glossary.md`

## Where code lives

- `apps/server` - WebSocket, orchestration (`src/orchestration/{project,board,thread}`), providers, checkpointing. Effect-heavy: read `repos/effect/LLMS.md` before writing Effect code.
- `apps/web` - React/Vite UI. `apps/desktop` wraps it, `apps/marketing` is the future marketing site (https://noyau.hezaerd.com), `apps/docs` is the future documentation site
- `packages/contracts` - Effect/Schema contracts plus small derived helpers. No decide / evolve / recover.
- `packages/shared` - shared runtime utils, subpath exports, no barrel.
- `packages/client-runtime` - client code shared.
- `.repos/` - vendored read-only references. Prefer their patterns over invented ones. Never edit or import from them. Sync with `vpr sync:repos` when bumping the matching dependency.

## Taste

- Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- Our users drive agents all day and notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations; they peg the GPU on high-refresh displays.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Additional tips

- Don't verify with browsers or computer use unless the user explicitly agrees or requests it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.
