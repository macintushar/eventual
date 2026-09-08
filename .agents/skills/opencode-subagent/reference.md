# OpenCode CLI reference

Full command surface, for when `SKILL.md` doesn't cover what you need. Verified against
**opencode 1.18.11**. `opencode <cmd> --help` is always the authority.

Source: <https://opencode.ai/docs/cli.md>

## Commands

| Command | Purpose | Interactive? |
|---|---|---|
| `opencode [project]` | Start TUI | **yes — never call from an agent** |
| `opencode run [message..]` | Non-interactive prompt | no |
| `opencode serve` | Headless HTTP server | no (long-running) |
| `opencode web` | Server + opens browser | **yes** |
| `opencode attach <url>` | Attach TUI to remote server | **yes** |
| `opencode acp` | ACP server over stdin/stdout nd-JSON | no |
| `opencode agent create\|list` | Manage agents | only if flags omitted |
| `opencode providers` (alias `auth`) | `login` / `list` / `logout` | `login` is **yes** |
| `opencode models [provider]` | List models | no |
| `opencode session list\|delete` | Manage sessions | no |
| `opencode export [sessionID]` | Export session JSON | no |
| `opencode import <file\|url>` | Import session | no |
| `opencode stats` | Token/cost stats | no |
| `opencode mcp` | `add` / `list` / `auth` / `logout` / `debug` | `add`, `auth` are **yes** |
| `opencode github install\|run` | GitHub Actions agent | `install` is **yes** |
| `opencode pr <number>` | Checkout PR and run | **yes** |
| `opencode plugin <module>` | Install plugin | no |
| `opencode db [path]` | DB tools (`--format json\|tsv`) | no |
| `opencode debug` | Troubleshooting tools | varies |
| `opencode upgrade [target]` | Update opencode | no |
| `opencode uninstall` | Remove opencode | prompts unless `--force` |
| `opencode completion` | Shell completion script | no |

## `opencode run` flags

| Flag | Notes |
|---|---|
| `--command` | Run a named command; message becomes its args |
| `-c, --continue` | Continue last session |
| `-s, --session <id>` | Continue a specific session |
| `--fork` | Branch the session; needs `--continue` or `--session` |
| `--share` | Share the session publicly — **confirm with the user first** |
| `-m, --model <provider/model>` | e.g. `anthropic/claude-sonnet-5` |
| `--variant <v>` | Reasoning effort: `minimal`, `high`, `max`, … |
| `--agent <name>` | Use a named agent |
| `--format default\|json` | `json` = raw JSON event stream |
| `-f, --file <path>` | Attach file(s); repeatable |
| `--title <t>` | Session title (helps you find it later) |
| `--thinking` | Show thinking blocks |
| `--attach <url>` | Use a running server instead of booting one |
| `-u, --username` / `-p, --password` | Basic auth for `--attach` |
| `--dir <path>` | Working directory (remote path if attaching) |
| `--port <n>` | Port for the local server |
| `--auto` | Auto-approve all non-denied permissions |
| `-i, --interactive` | **Interactive — do not use from an agent** |

**Always append `< /dev/null`.** `opencode run` blocks on stdin; with an inherited open pipe it
hangs forever with no output. Not a flag, but non-optional in practice.

## Global flags

`-h/--help`, `-v/--version`, `--print-logs` (logs to stderr), `--log-level DEBUG|INFO|WARN|ERROR`,
`--pure` (no external plugins).

`--print-logs --log-level DEBUG` is the first thing to reach for when a delegation misbehaves;
logs go to stderr so they won't pollute a parsed stdout.

## Other subcommand flags

- `agent create`: `--path`, `--description`, `--mode all|primary|subagent`,
  `--permissions`/`--tools` (`bash, read, edit, glob, grep, webfetch, task, todowrite,
  websearch, lsp, skill`), `-m/--model`. All required flags present ⇒ non-interactive.
- `session list`: `-n/--max-count`, `--format table|json`.
- `export`: `--sanitize` to redact sensitive content.
- `models`: `--refresh` (re-fetch from models.dev), `--verbose` (costs/metadata).
- `stats`: `--days`, `--tools`, `--models`, `--project`.
- `serve` / `web` / `acp`: `--port`, `--hostname`, `--mdns`, `--mdns-domain`, `--cors`.
- `upgrade`: `-m/--method curl|npm|pnpm|bun|brew`.
- `uninstall`: `-c/--keep-config`, `-d/--keep-data`, `--dry-run`, `-f/--force`.

## Data shapes

### `run --format json` → NDJSON event stream

One JSON object per line. Every event has `type`, `timestamp`, `sessionID`, `part`.

| Event `type` | `part` contents |
|---|---|
| `step_start` | `id`, `messageID`, `sessionID`, `type: "step-start"` |
| `text` | `text` (the prose), `time{start,end}`, `metadata` (provider-specific) |
| `step_finish` | `reason` (`"stop"`), `tokens{total,input,output,reasoning,cache{read,write}}`, `cost` |

Tool calls and reasoning produce their own event types; filter on `type` rather than assuming
only these three appear. Event `type` uses underscores (`step_finish`); `part.type` uses hyphens
(`step-finish`).

### `session list --format json` → newest-first array

```json
[{ "id": "ses_…", "title": "…", "updated": 1785666816269,
   "created": 1785666809359, "projectId": "global", "directory": "/abs/path" }]
```

`opencode export <id>` → `{ "info": {…}, "messages": […] }`

`info`: `id`, `slug`, `projectID`, `directory`, `path`, `title`, `agent`,
`model{id,providerID,variant}`, `version`, `summary{additions,deletions,files}`, `cost`,
`tokens{input,output,reasoning,cache{read,write}}`, `permission[]`, `time{created,updated}`.

`messages[]`: `{ info: { role, time, agent, model{providerID,modelID}, id, sessionID },
parts: [...] }`. Assistant parts are typically `step-start`, `text`, `step-finish` — filter to
`type == "text"` for prose.

## Environment variables

**Config:** `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_CONFIG_CONTENT` (inline JSON),
`OPENCODE_TUI_CONFIG`, `OPENCODE_PERMISSION` (inline permissions JSON — a finer-grained
alternative to `--auto`).

**Server:** `OPENCODE_SERVER_PASSWORD` (enables basic auth), `OPENCODE_SERVER_USERNAME`
(default `opencode`), `OPENCODE_CLIENT`.

**Behavior:** `OPENCODE_AUTO_SHARE`, `OPENCODE_DISABLE_AUTOUPDATE`, `OPENCODE_DISABLE_PRUNE`,
`OPENCODE_DISABLE_TERMINAL_TITLE`, `OPENCODE_DISABLE_DEFAULT_PLUGINS`,
`OPENCODE_DISABLE_LSP_DOWNLOAD`, `OPENCODE_DISABLE_AUTOCOMPACT`,
`OPENCODE_DISABLE_CLAUDE_CODE` (stop reading `.claude/`), `OPENCODE_DISABLE_MODELS_FETCH`,
`OPENCODE_DISABLE_MOUSE`, `OPENCODE_ENABLE_EXPERIMENTAL_MODELS`, `OPENCODE_ENABLE_EXA`.

Useful for a quiet, reproducible subagent run:

```bash
OPENCODE_DISABLE_AUTOUPDATE=1 OPENCODE_DISABLE_TERMINAL_TITLE=1 \
  opencode run --pure --auto "…"
```

**Advanced:** `OPENCODE_GIT_BASH_PATH`, `OPENCODE_FAKE_VCS`, `OPENCODE_MODELS_URL`.

**Experimental:** `OPENCODE_EXPERIMENTAL` (umbrella) plus individual toggles such as
`OPENCODE_EXPERIMENTAL_PLAN_MODE`, `OPENCODE_EXPERIMENTAL_WORKSPACES`,
`OPENCODE_EXPERIMENTAL_FILEWATCHER`, `OPENCODE_EXPERIMENTAL_SCOUT`.

Credentials live in `~/.local/share/opencode/auth.json`.
